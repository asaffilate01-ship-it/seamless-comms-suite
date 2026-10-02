BEGIN;
CREATE TABLE IF NOT EXISTS public.geo_zones(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 name text NOT NULL,zone_kind text NOT NULL CHECK(zone_kind IN('circle','polygon','postcode','service_area')),shape jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.dispatch_agents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 name text NOT NULL,agent_role text NOT NULL DEFAULT 'driver',status text NOT NULL DEFAULT 'offline' CHECK(status IN('offline','available','busy','break','suspended')),
 skills text[] NOT NULL DEFAULT '{}',capacity numeric,phone text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.dispatch_vehicles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),registration text,vehicle_type text NOT NULL,capacity numeric,
 status text NOT NULL DEFAULT 'available' CHECK(status IN('available','assigned','maintenance','inactive')),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.dispatch_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 job_type text NOT NULL,status text NOT NULL DEFAULT 'unassigned' CHECK(status IN('unassigned','offered','assigned','accepted','en_route','arrived','in_progress','collected','en_route_dropoff','arrived_dropoff','completed','failed','cancelled')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),required_skills text[] NOT NULL DEFAULT '{}',
 required_vehicle_types text[] NOT NULL DEFAULT '{}',capacity_demand numeric,scheduled_at timestamptz,assigned_agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE SET NULL,
 assigned_vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,external_ref text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_jobs_external_uq ON public.dispatch_jobs(tenant_id,product_key,external_ref) WHERE external_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.dispatch_job_stops(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,position integer NOT NULL,stop_kind text NOT NULL CHECK(stop_kind IN('pickup','dropoff','service','return')),
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 address text,contact_name text,contact_phone text,instructions text,window_start timestamptz,window_end timestamptz,service_seconds integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','arrived','completed','skipped','failed')),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,UNIQUE(job_id,position));
CREATE TABLE IF NOT EXISTS public.dispatch_agent_positions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),accuracy_metres numeric,speed_kph numeric,heading_degrees numeric,
 observed_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS dispatch_positions_agent_idx ON public.dispatch_agent_positions(tenant_id,agent_id,observed_at DESC);
CREATE TABLE IF NOT EXISTS public.dispatch_pod(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 job_id uuid NOT NULL UNIQUE REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,completed_at timestamptz NOT NULL DEFAULT now(),methods text[] NOT NULL,
 evidence_refs text[] NOT NULL DEFAULT '{}',recipient_name text,note text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS public.tracking_snapshots(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,subject_type text NOT NULL,subject_id text NOT NULL,status text,
 eta_at timestamptz,latitude double precision,longitude double precision,heading double precision,progress numeric,public_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision bigint NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,subject_type,subject_id));
CREATE TABLE IF NOT EXISTS public.public_tracking_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,subject_type text NOT NULL,subject_id text NOT NULL,
 token_hash text NOT NULL UNIQUE,public_fields text[] NOT NULL DEFAULT ARRAY['status','etaAt','latitude','longitude','progress','updatedAt']::text[],
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['geo_zones','dispatch_agents','dispatch_vehicles','dispatch_jobs','dispatch_job_stops','dispatch_agent_positions','dispatch_pod','tracking_snapshots','public_tracking_tokens'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','dispatch tenant read',t);
 EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','dispatch tenant write',t);
 END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.dispatch_create_job(_tenant uuid,_product text,_location uuid,_job_type text,_priority text,_external_ref text,_metadata jsonb,_stops jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j uuid;item jsonb;pos integer:=0;BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Dispatch access denied';END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.dispatch') AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Dispatch entitlement required';END IF;
 IF jsonb_typeof(_stops)<>'array' OR jsonb_array_length(_stops)<1 THEN RAISE EXCEPTION 'At least one stop required';END IF;
 INSERT INTO public.dispatch_jobs(tenant_id,product_key,location_id,job_type,priority,external_ref,metadata) VALUES(_tenant,_product,_location,_job_type,_priority,NULLIF(_external_ref,''),COALESCE(_metadata,'{}')) RETURNING id INTO j;
 FOR item IN SELECT value FROM jsonb_array_elements(_stops) LOOP
  INSERT INTO public.dispatch_job_stops(job_id,tenant_id,position,stop_kind,latitude,longitude,address,contact_name,contact_phone,instructions)
  VALUES(j,_tenant,pos,item->>'kind',(item->>'lat')::double precision,(item->>'lng')::double precision,item->>'address',item->>'contactName',item->>'contactPhone',item->>'instructions');pos:=pos+1;
 END LOOP;RETURN j;END;$$;
CREATE OR REPLACE FUNCTION public.dispatch_assign_job(_job uuid,_agent uuid,_vehicle uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE j public.dispatch_jobs%rowtype;BEGIN
 SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;IF NOT FOUND OR (NOT public.can_write(j.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'Dispatch access denied';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dispatch_agents a WHERE a.id=_agent AND a.tenant_id=j.tenant_id AND a.status='available') THEN RAISE EXCEPTION 'Agent unavailable';END IF;
 IF _vehicle IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dispatch_vehicles v WHERE v.id=_vehicle AND v.tenant_id=j.tenant_id AND v.status='available') THEN RAISE EXCEPTION 'Vehicle unavailable';END IF;
 UPDATE public.dispatch_jobs SET assigned_agent_id=_agent,assigned_vehicle_id=_vehicle,status='assigned',updated_at=now() WHERE id=_job;
 UPDATE public.dispatch_agents SET status='busy',updated_at=now() WHERE id=_agent;IF _vehicle IS NOT NULL THEN UPDATE public.dispatch_vehicles SET status='assigned',updated_at=now() WHERE id=_vehicle;END IF;END;$$;
CREATE OR REPLACE FUNCTION public.dispatch_update_status(_job uuid,_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE j public.dispatch_jobs%rowtype;BEGIN
 SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;IF NOT FOUND OR (NOT public.can_write(j.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'Dispatch access denied';END IF;
 IF _status NOT IN('unassigned','offered','assigned','accepted','en_route','arrived','in_progress','collected','en_route_dropoff','arrived_dropoff','completed','failed','cancelled') THEN RAISE EXCEPTION 'Invalid dispatch status';END IF;
 UPDATE public.dispatch_jobs SET status=_status,updated_at=now() WHERE id=_job;
 IF _status IN('completed','failed','cancelled') THEN UPDATE public.dispatch_agents SET status='available' WHERE id=j.assigned_agent_id;UPDATE public.dispatch_vehicles SET status='available' WHERE id=j.assigned_vehicle_id;END IF;END;$$;
UPDATE public.service_catalogue SET implementation_status='built_main',updated_at=now() WHERE service_key IN('omniqora.geo','omniqora.dispatch','omniqora.fleet','omniqora.tracking','omniqora.agent');
COMMIT;