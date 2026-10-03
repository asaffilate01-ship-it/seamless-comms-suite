BEGIN;

CREATE OR REPLACE FUNCTION public.project_connected_operations_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb:=NEW.payload;
DECLARE v_status text;
BEGIN
 IF NEW.event_type='dishbee.device.health' THEN
  v_status:=COALESCE(p->>'status','unknown');
  IF v_status NOT IN('unknown','online','healthy','degraded','offline','disabled') THEN v_status:='unknown';END IF;
  INSERT INTO public.connected_operation_targets(
   tenant_id,product_key,target_type,external_ref,external_location_ref,name,status,
   capabilities,last_seen_at,last_event_at,summary,metadata
  ) VALUES(
   NEW.tenant_id,NEW.product_key,COALESCE(p->>'targetType','other'),COALESCE(p->>'externalRef',NEW.subject_id),
   p->>'externalLocationRef',p->>'name',v_status,
   COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p->'capabilities','[]'::jsonb))),'{}'::text[]),
   COALESCE((p->>'lastSeenAt')::timestamptz,NEW.occurred_at),NEW.occurred_at,
   COALESCE(p->'summary','{}'::jsonb),COALESCE(p->'metadata','{}'::jsonb)
  )
  ON CONFLICT(tenant_id,product_key,target_type,external_ref) DO UPDATE SET
   external_location_ref=EXCLUDED.external_location_ref,name=EXCLUDED.name,status=EXCLUDED.status,
   capabilities=EXCLUDED.capabilities,last_seen_at=EXCLUDED.last_seen_at,last_event_at=EXCLUDED.last_event_at,
   summary=EXCLUDED.summary,metadata=public.connected_operation_targets.metadata||EXCLUDED.metadata,updated_at=now();

 ELSIF NEW.event_type='dishbee.pricing.recommendation' THEN
  INSERT INTO public.pricing_intelligence_queue(
   tenant_id,product_key,external_item_ref,external_location_ref,channel_key,fulfilment,currency,
   current_minor,recommended_minor,estimated_cost_minor,target_margin_bps,reason,inputs,status,source_ref
  ) VALUES(
   NEW.tenant_id,NEW.product_key,COALESCE(p->>'externalItemRef',NEW.subject_id),p->>'externalLocationRef',
   COALESCE(p->>'channelKey','direct'),p->>'fulfilment',upper(COALESCE(p->>'currency','GBP')),
   GREATEST(COALESCE((p->>'currentMinor')::bigint,0),0),
   GREATEST(COALESCE((p->>'recommendedMinor')::bigint,0),0),
   CASE WHEN p ? 'estimatedCostMinor' THEN (p->>'estimatedCostMinor')::bigint ELSE NULL END,
   CASE WHEN p ? 'targetMarginBps' THEN (p->>'targetMarginBps')::integer ELSE NULL END,
   p->>'reason',COALESCE(p->'inputs','{}'::jsonb),'pending',NEW.idempotency_key
  )
  ON CONFLICT(tenant_id,product_key,source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET
   current_minor=EXCLUDED.current_minor,recommended_minor=EXCLUDED.recommended_minor,
   estimated_cost_minor=EXCLUDED.estimated_cost_minor,target_margin_bps=EXCLUDED.target_margin_bps,
   reason=EXCLUDED.reason,inputs=EXCLUDED.inputs,
   status=CASE WHEN public.pricing_intelligence_queue.status='applied' THEN 'applied' ELSE 'pending' END,updated_at=now();

 ELSIF NEW.event_type='dishbee.display.assignment' THEN
  INSERT INTO public.display_orchestration_links(
   tenant_id,product_key,external_profile_ref,external_location_ref,campaign_ref,content_ref,
   assignment_type,status,starts_at,ends_at,targeting,metadata
  ) VALUES(
   NEW.tenant_id,NEW.product_key,COALESCE(p->>'externalProfileRef',NEW.subject_id),p->>'externalLocationRef',
   p->>'campaignRef',p->>'contentRef',COALESCE(p->>'assignmentType','campaign'),
   COALESCE(p->>'status','scheduled'),
   CASE WHEN p ? 'startsAt' THEN (p->>'startsAt')::timestamptz ELSE NULL END,
   CASE WHEN p ? 'endsAt' THEN (p->>'endsAt')::timestamptz ELSE NULL END,
   COALESCE(p->'targeting','{}'::jsonb),COALESCE(p->'metadata','{}'::jsonb)
  );
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- Connected-ops projection must never make the canonical platform event fail.
 RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS platform_project_connected_operations ON public.platform_events;
CREATE TRIGGER platform_project_connected_operations
AFTER INSERT ON public.platform_events
FOR EACH ROW
WHEN (NEW.event_type IN('dishbee.device.health','dishbee.pricing.recommendation','dishbee.display.assignment'))
EXECUTE FUNCTION public.project_connected_operations_event();

REVOKE ALL ON FUNCTION public.project_connected_operations_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_connected_operations_event() TO service_role;

COMMIT;