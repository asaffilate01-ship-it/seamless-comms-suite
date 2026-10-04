BEGIN;

UPDATE public.product_catalogue
SET
  description='Food-safety, HACCP, allergen, evidence, inspection and regulatory-compliance operations for standalone and embedded hospitality use.',
  metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
    'family','haccora',
    'standalone',true,
    'embeddedIn',jsonb_build_array('dishbee'),
    'countryPacks',jsonb_build_array('GB','DE')
  ),
  updated_at=now()
WHERE product_key='haccora';

CREATE TABLE IF NOT EXISTS public.service_product_dependencies (
  service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(service_key,product_key)
);

ALTER TABLE public.service_product_dependencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_product_dependencies_admin_read ON public.service_product_dependencies;
CREATE POLICY service_product_dependencies_admin_read
ON public.service_product_dependencies
FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('haccora.core','Haccora Core','Core food-safety workspace, tenancy, locations, checks and controlled evidence.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.haccp','HACCP Management','Versioned HACCP plans, hazards, controls, monitoring and corrective actions.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.allergens','Allergen & PPDS','Ingredient, recipe, allergen, PPDS and menu-change review workflows.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.evidence','Compliance Evidence','Temperatures, cleaning, checks, documents and tamper-evident inspection evidence.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.traceability','Traceability & Recall','Supplier, goods-in, batch, traceability and recall workflows.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.training','Food Safety Training','Role-based training, refresher and competency evidence.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.inspections','Inspection Readiness','Scoped inspector access, audit preparation and evidence export.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.sensors','Sensors & IoT','Provisioning and ingestion for approved food-safety sensors.','compliance','haccora',true,'external','active','built_main'),
 ('haccora.ai-copilot','Haccora AI Copilot','Governed food-safety assistant with review-required compliance proposals.','ai','haccora',true,'automatic','active','built_main'),
 ('haccora.document-ai','Haccora Document AI','Reviewed extraction from specifications, certificates, labels and compliance evidence.','ai','haccora',true,'automatic','active','built_main'),
 ('haccora.rag','Haccora RAG','Evidence-grounded retrieval across approved Haccora documents and records.','ai','haccora',true,'automatic','active','built_main'),
 ('haccora.graphrag','Haccora GraphRAG','Relationship-aware investigation across menu, ingredient, supplier, hazard, control and evidence graphs.','ai','haccora',true,'automatic','active','built_main'),
 ('haccora.regulatory-intelligence','Haccora Regulatory Intelligence','Reviewed regulatory-source monitoring and impact tracking for food-safety controls.','compliance','haccora',true,'automatic','active','built_main'),
 ('haccora.analytics','Haccora Analytics','Compliance KPIs, multi-site readiness, trends and exception reporting.','analytics','haccora',true,'automatic','active','built_main'),
 ('haccora.dishbee-sync','Haccora for Dishbee','Entitlement-driven Dishbee/Haccora tenant, location, people, menu, supplier and compliance-status synchronisation.','integration','haccora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
 ('haccora.haccp','haccora.core',true),
 ('haccora.allergens','haccora.core',true),
 ('haccora.evidence','haccora.core',true),
 ('haccora.traceability','haccora.core',true),
 ('haccora.training','haccora.core',true),
 ('haccora.inspections','haccora.core',true),
 ('haccora.sensors','haccora.core',true),
 ('haccora.ai-copilot','haccora.core',true),
 ('haccora.ai-copilot','omniqora.ai',true),
 ('haccora.ai-copilot','omniqora.ai-governance',true),
 ('haccora.ai-copilot','omniqora.intelligence-runtime',true),
 ('haccora.document-ai','haccora.core',true),
 ('haccora.document-ai','omniqora.ai',true),
 ('haccora.rag','haccora.core',true),
 ('haccora.rag','omniqora.ai',true),
 ('haccora.rag','omniqora.rrci',true),
 ('haccora.graphrag','haccora.rag',true),
 ('haccora.graphrag','omniqora.graphrag',true),
 ('haccora.regulatory-intelligence','haccora.graphrag',true),
 ('haccora.regulatory-intelligence','omniqora.regulatory-monitoring',true),
 ('haccora.analytics','haccora.core',true),
 ('haccora.analytics','omniqora.analytics',true),
 ('haccora.dishbee-sync','haccora.core',true),
 ('haccora.dishbee-sync','omniqora.connectors',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
 ('haccora','haccora.core',true,true),
 ('haccora','haccora.haccp',true,true),
 ('haccora','haccora.allergens',true,true),
 ('haccora','haccora.evidence',true,true),
 ('haccora','haccora.traceability',true,false),
 ('haccora','haccora.training',true,false),
 ('haccora','haccora.inspections',true,false),
 ('haccora','haccora.analytics',true,false),
 ('haccora','haccora.sensors',false,false),
 ('haccora','haccora.ai-copilot',false,false),
 ('haccora','haccora.document-ai',false,false),
 ('haccora','haccora.rag',false,false),
 ('haccora','haccora.graphrag',false,false),
 ('haccora','haccora.regulatory-intelligence',false,false),
 ('haccora','haccora.dishbee-sync',false,false),
 ('dishbee','haccora.core',false,false),
 ('dishbee','haccora.dishbee-sync',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=EXCLUDED.default_enabled,
 required=EXCLUDED.required;

INSERT INTO public.service_product_dependencies(service_key,product_key,required,config)
SELECT service_key,'haccora',true,'{}'::jsonb
FROM public.service_catalogue
WHERE service_key LIKE 'haccora.%'
ON CONFLICT(service_key,product_key) DO UPDATE SET required=true;

INSERT INTO public.service_product_dependencies(service_key,product_key,required,config)
VALUES('haccora.dishbee-sync','dishbee',true,'{}'::jsonb)
ON CONFLICT(service_key,product_key) DO UPDATE SET required=true;

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category,metadata) VALUES
 ('haccora-uk','Haccora · United Kingdom','Standalone Haccora workspace using the UK food-safety country pack.','GB','compliance',
  '{"product":"haccora","countryPack":"GB","locale":"en-GB","mode":"standalone"}'::jsonb),
 ('haccora-de','Haccora · Germany','Standalone Haccora workspace using the German food-safety country pack.','DE','compliance',
  '{"product":"haccora","countryPack":"DE","locale":"de-DE","mode":"standalone"}'::jsonb),
 ('dishbee-haccora-uk','Dishbee + Haccora · UK','Dishbee restaurant workspace with Haccora compliance enabled as an embedded add-on.','GB','hospitality',
  '{"products":["dishbee","haccora"],"countryPack":"GB","locale":"en-GB","mode":"embedded"}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=EXCLUDED.name,
 description=EXCLUDED.description,
 country_code=EXCLUDED.country_code,
 category=EXCLUDED.category,
 metadata=EXCLUDED.metadata,
 status='active';

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
 ('haccora-uk','haccora',true,'{"countryPack":"GB","locale":"en-GB","jurisdiction":"UK","mode":"standalone"}'::jsonb),
 ('haccora-de','haccora',true,'{"countryPack":"DE","locale":"de-DE","jurisdiction":"DE","mode":"standalone"}'::jsonb),
 ('dishbee-haccora-uk','dishbee',true,'{"mode":"host"}'::jsonb),
 ('dishbee-haccora-uk','haccora',true,'{"countryPack":"GB","locale":"en-GB","jurisdiction":"UK","mode":"dishbee-addon"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET
 required=EXCLUDED.required,
 config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
 ('haccora-uk','haccora.core',true,'{}'::jsonb),
 ('haccora-uk','haccora.haccp',true,'{}'::jsonb),
 ('haccora-uk','haccora.allergens',true,'{}'::jsonb),
 ('haccora-uk','haccora.evidence',true,'{}'::jsonb),
 ('haccora-uk','haccora.traceability',false,'{}'::jsonb),
 ('haccora-uk','haccora.training',false,'{}'::jsonb),
 ('haccora-uk','haccora.inspections',false,'{}'::jsonb),
 ('haccora-uk','haccora.analytics',false,'{}'::jsonb),
 ('haccora-de','haccora.core',true,'{}'::jsonb),
 ('haccora-de','haccora.haccp',true,'{}'::jsonb),
 ('haccora-de','haccora.allergens',true,'{}'::jsonb),
 ('haccora-de','haccora.evidence',true,'{}'::jsonb),
 ('haccora-de','haccora.traceability',false,'{}'::jsonb),
 ('haccora-de','haccora.training',false,'{}'::jsonb),
 ('haccora-de','haccora.inspections',false,'{}'::jsonb),
 ('haccora-de','haccora.analytics',false,'{}'::jsonb),
 ('dishbee-haccora-uk','dishbee.kds',true,'{}'::jsonb),
 ('dishbee-haccora-uk','omniqora.payments',true,'{}'::jsonb),
 ('dishbee-haccora-uk','haccora.core',true,'{"surface":"dishbee"}'::jsonb),
 ('dishbee-haccora-uk','haccora.dishbee-sync',true,'{"direction":"bidirectional"}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET
 required=EXCLUDED.required,
 config=EXCLUDED.config;

CREATE OR REPLACE FUNCTION public.apply_service_with_dependencies(
  _tenant uuid,
  _service text,
  _source text DEFAULT 'manual'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.service_catalogue
    WHERE service_key=_service AND status IN ('active','beta','internal')
  ) THEN
    RAISE EXCEPTION 'Unknown service';
  END IF;

  WITH RECURSIVE required_services(service_key) AS (
    SELECT _service
    UNION
    SELECT d.depends_on_service_key
    FROM public.service_dependencies d
    JOIN required_services r ON d.service_key=r.service_key
    WHERE d.required
  )
  INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
  SELECT _tenant,service_key,'requested',_source
  FROM required_services
  ON CONFLICT(tenant_id,service_key) DO UPDATE SET
    status=CASE
      WHEN public.tenant_services.status IN ('active','trial') THEN public.tenant_services.status
      ELSE 'requested'
    END,
    source=EXCLUDED.source,
    updated_at=now();

  WITH RECURSIVE required_services(service_key) AS (
    SELECT _service
    UNION
    SELECT d.depends_on_service_key
    FROM public.service_dependencies d
    JOIN required_services r ON d.service_key=r.service_key
    WHERE d.required
  ),
  required_products AS (
    SELECT DISTINCT ON (spd.product_key)
      spd.product_key,
      spd.config
    FROM public.service_product_dependencies spd
    JOIN required_services rs ON rs.service_key=spd.service_key
    WHERE spd.required
    ORDER BY spd.product_key,spd.service_key
  )
  INSERT INTO public.tenant_products(tenant_id,product_key,status,config)
  SELECT _tenant,product_key,'requested',config
  FROM required_products
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET
    status=CASE
      WHEN public.tenant_products.status IN ('active','provisioning') THEN public.tenant_products.status
      ELSE 'requested'
    END,
    config=public.tenant_products.config || EXCLUDED.config,
    updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.apply_service_with_dependencies(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_service_with_dependencies(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_service(
  _tenant uuid,
  _service text,
  _enabled boolean,
  _config jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE dep record;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  IF _enabled THEN
    PERFORM public.apply_service_with_dependencies(_tenant,_service,'manual');
    UPDATE public.tenant_services
      SET config=COALESCE(_config,'{}'::jsonb),updated_at=now()
      WHERE tenant_id=_tenant AND service_key=_service;

    FOR dep IN
      WITH RECURSIVE required_services(service_key) AS (
        SELECT _service
        UNION
        SELECT d.depends_on_service_key
        FROM public.service_dependencies d
        JOIN required_services r ON d.service_key=r.service_key
        WHERE d.required
      )
      SELECT service_key FROM required_services
    LOOP
      PERFORM public.queue_provisioning(_tenant,'service',dep.service_key,'provision',
        CASE WHEN dep.service_key=_service THEN COALESCE(_config,'{}'::jsonb) ELSE '{}'::jsonb END);
    END LOOP;

    FOR dep IN
      WITH RECURSIVE required_services(service_key) AS (
        SELECT _service
        UNION
        SELECT d.depends_on_service_key
        FROM public.service_dependencies d
        JOIN required_services r ON d.service_key=r.service_key
        WHERE d.required
      )
      SELECT DISTINCT spd.product_key
      FROM public.service_product_dependencies spd
      JOIN required_services rs ON rs.service_key=spd.service_key
      WHERE spd.required
    LOOP
      PERFORM public.queue_provisioning(_tenant,'product',dep.product_key,'provision',
        jsonb_build_object('requiredByService',_service));
    END LOOP;
  ELSE
    IF EXISTS(
      SELECT 1
      FROM public.service_dependencies d
      JOIN public.tenant_services s
        ON s.tenant_id=_tenant
       AND s.service_key=d.service_key
       AND s.status IN ('requested','provisioning','trial','active')
      WHERE d.depends_on_service_key=_service AND d.required
    ) THEN
      RAISE EXCEPTION 'Service is required by another enabled service';
    END IF;

    UPDATE public.tenant_services
      SET status='cancelled',updated_at=now()
      WHERE tenant_id=_tenant AND service_key=_service;
    PERFORM public.queue_provisioning(_tenant,'service',_service,'deprovision','{}'::jsonb);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_set_tenant_service(uuid,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_service(uuid,text,boolean,jsonb) TO authenticated,service_role;

COMMIT;
