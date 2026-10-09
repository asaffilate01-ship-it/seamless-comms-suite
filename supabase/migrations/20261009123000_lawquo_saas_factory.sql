BEGIN;

-- Lawquo is a first-class legal SaaS product in Omniqora. The marketplace is a
-- Lawquo workspace/surface, not a separate top-level SaaS product.
UPDATE public.product_catalogue
SET
  name = 'Lawquo',
  description = 'International legal marketplace and legal practice operating system.',
  category = 'legal',
  deployment_mode = 'external',
  status = 'active',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'architecture', 'landlord-with-workspaces',
    'canonicalRepository', 'https://github.com/asaffilate01-ship-it/law-remix.git',
    'marketplaceIsWorkspace', true
  ),
  updated_at = now()
WHERE product_key = 'lawquo';

INSERT INTO public.service_catalogue
(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata)
VALUES
('lawquo.core','Lawquo Core','Legal identities, professional memberships, matters and base product capabilities.','legal','lawquo',true,'external','active','{"surface":"core"}'),
('lawquo.marketplace','Lawquo Marketplace','International verified-lawyer discovery, matching, enquiries, quotes and instructions.','marketplace','lawquo',true,'external','active','{"surface":"marketplace"}'),
('lawquo.verification','Lawquo Verification','Professional identity, regulator/bar registration and practising-status verification workflows.','compliance','lawquo',true,'external','active','{"surface":"verification"}'),
('lawquo.pro','Lawquo Pro','Practice management, matters, documents, tasks, billing and legal operations for firms and practitioners.','legal','lawquo',true,'external','active','{"surface":"pro"}'),
('lawquo.chambers','Lawquo Chambers','Chambers and barrister administration, profiles, clerking and marketplace participation.','legal','lawquo',true,'external','active','{"surface":"chambers"}'),
('lawquo.client-portal','Lawquo Client Portal','Client matter room, documents, messages, instructions and approved updates.','legal','lawquo',true,'external','active','{"surface":"client"}'),
('lawquo.intelligence','Lawquo Intelligence','Governed legal AI, matter intelligence and reviewed drafting.','ai','lawquo',true,'external','active','{"surface":"intelligence"}')
ON CONFLICT (service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  metadata=EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required)
VALUES
('lawquo.marketplace','lawquo.core',true),
('lawquo.marketplace','lawquo.verification',true),
('lawquo.verification','lawquo.core',true),
('lawquo.pro','lawquo.core',true),
('lawquo.chambers','lawquo.core',true),
('lawquo.client-portal','lawquo.core',true),
('lawquo.intelligence','lawquo.core',true),
('lawquo.intelligence','omniqora.ai',true),
('lawquo.marketplace','omniqora.marketplace',true)
ON CONFLICT (service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES
('lawquo','lawquo.core',true,true,'{"surface":"core"}'),
('lawquo','lawquo.marketplace',true,true,'{"surface":"marketplace"}'),
('lawquo','lawquo.verification',true,true,'{"surface":"verification"}'),
('lawquo','lawquo.pro',false,false,'{"surface":"pro"}'),
('lawquo','lawquo.chambers',false,false,'{"surface":"chambers"}'),
('lawquo','lawquo.client-portal',true,false,'{"surface":"client"}'),
('lawquo','lawquo.intelligence',true,false,'{"surface":"intelligence"}'),
('lawquo','omniqora.identity',true,true,'{"shared":true}'),
('lawquo','omniqora.marketplace',true,true,'{"shared":true}'),
('lawquo','omniqora.crm',false,false,'{"shared":true}'),
('lawquo','omniqora.connect',false,false,'{"shared":true}'),
('lawquo','omniqora.analytics',false,false,'{"shared":true}'),
('lawquo','omniqora.payments',false,false,'{"shared":true}'),
('lawquo','omniqora.ai',true,false,'{"shared":true}')
ON CONFLICT (product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required,
  metadata=EXCLUDED.metadata;

CREATE TABLE IF NOT EXISTS public.product_workspace_types (
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  workspace_type text NOT NULL CHECK (workspace_type ~ '^[a-z0-9][a-z0-9_-]{1,60}$'),
  name text NOT NULL,
  description text,
  system_workspace boolean NOT NULL DEFAULT false,
  allow_multiple boolean NOT NULL DEFAULT true,
  default_services text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_key,workspace_type)
);

ALTER TABLE public.product_workspace_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_workspace_types FROM anon, authenticated;
GRANT ALL ON public.product_workspace_types TO service_role;
GRANT SELECT ON public.product_workspace_types TO authenticated;

DROP POLICY IF EXISTS "catalogue workspace types read" ON public.product_workspace_types;
CREATE POLICY "catalogue workspace types read"
ON public.product_workspace_types FOR SELECT TO authenticated USING (true);

INSERT INTO public.product_workspace_types
(product_key,workspace_type,name,description,system_workspace,allow_multiple,default_services,metadata)
VALUES
('lawquo','landlord','Lawquo Landlord','Platform governance, jurisdiction catalogue, verification rules, moderation and tenant provisioning.',true,false,ARRAY['lawquo.core','lawquo.verification'],'{"audience":"platform"}'),
('lawquo','marketplace','Lawquo Marketplace','Public international legal marketplace and cross-border matching surface.',true,false,ARRAY['lawquo.core','lawquo.marketplace','lawquo.verification','lawquo.client-portal'],'{"audience":"public-and-client"}'),
('lawquo','firm','Law Firm','Law-firm tenant workspace with staff, matters and optional marketplace participation.',false,true,ARRAY['lawquo.core','lawquo.pro','lawquo.client-portal'],'{"audience":"organisation"}'),
('lawquo','chambers','Chambers','Barristers chambers tenant workspace with clerking and marketplace participation.',false,true,ARRAY['lawquo.core','lawquo.chambers','lawquo.client-portal'],'{"audience":"organisation"}'),
('lawquo','solo_practitioner','Solo Practitioner','Individual solicitor, barrister, advocate or attorney workspace.',false,true,ARRAY['lawquo.core','lawquo.pro','lawquo.client-portal'],'{"audience":"professional"}'),
('lawquo','client','Client','Client-facing workspace linked to one or more instructed matters.',false,true,ARRAY['lawquo.core','lawquo.client-portal'],'{"audience":"client"}')
ON CONFLICT (product_key,workspace_type) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  system_workspace=EXCLUDED.system_workspace,
  allow_multiple=EXCLUDED.allow_multiple,
  default_services=EXCLUDED.default_services,
  metadata=EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.tenant_blueprints
(blueprint_key,name,description,country_code,category,status,metadata)
VALUES
('lawquo-platform','Lawquo Platform','Lawquo landlord plus global marketplace system workspaces.',NULL,'legal','active','{"workspaceTypes":["landlord","marketplace"]}'),
('lawquo-firm-uk','Lawquo Firm · UK','UK law-firm workspace with marketplace participation and practice-management capability.','GB','legal','active','{"workspaceType":"firm"}'),
('lawquo-chambers-uk','Lawquo Chambers · UK','UK chambers workspace with clerking and marketplace participation.','GB','legal','active','{"workspaceType":"chambers"}'),
('lawquo-solo-uk','Lawquo Solo Practitioner · UK','UK individual legal-professional workspace.','GB','legal','active','{"workspaceType":"solo_practitioner"}')
ON CONFLICT (blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,
  status='active',
  metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES
('lawquo-platform','lawquo',true,'{"workspaceTypes":["landlord","marketplace"]}'),
('lawquo-firm-uk','lawquo',true,'{"workspaceType":"firm"}'),
('lawquo-chambers-uk','lawquo',true,'{"workspaceType":"chambers"}'),
('lawquo-solo-uk','lawquo',true,'{"workspaceType":"solo_practitioner"}')
ON CONFLICT (blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES
('lawquo-platform','lawquo.core',true,'{}'),
('lawquo-platform','lawquo.marketplace',true,'{}'),
('lawquo-platform','lawquo.verification',true,'{}'),
('lawquo-platform','lawquo.client-portal',false,'{}'),
('lawquo-platform','lawquo.intelligence',false,'{}'),
('lawquo-platform','omniqora.marketplace',true,'{}'),
('lawquo-platform','omniqora.ai',false,'{}'),
('lawquo-platform','omniqora.analytics',false,'{}'),
('lawquo-firm-uk','lawquo.core',true,'{}'),
('lawquo-firm-uk','lawquo.pro',true,'{}'),
('lawquo-firm-uk','lawquo.client-portal',true,'{}'),
('lawquo-firm-uk','lawquo.marketplace',false,'{}'),
('lawquo-firm-uk','lawquo.intelligence',false,'{}'),
('lawquo-firm-uk','omniqora.connect',false,'{}'),
('lawquo-firm-uk','omniqora.crm',false,'{}'),
('lawquo-firm-uk','omniqora.analytics',false,'{}'),
('lawquo-chambers-uk','lawquo.core',true,'{}'),
('lawquo-chambers-uk','lawquo.chambers',true,'{}'),
('lawquo-chambers-uk','lawquo.client-portal',true,'{}'),
('lawquo-chambers-uk','lawquo.marketplace',false,'{}'),
('lawquo-chambers-uk','lawquo.intelligence',false,'{}'),
('lawquo-solo-uk','lawquo.core',true,'{}'),
('lawquo-solo-uk','lawquo.pro',true,'{}'),
('lawquo-solo-uk','lawquo.client-portal',true,'{}'),
('lawquo-solo-uk','lawquo.marketplace',false,'{}'),
('lawquo-solo-uk','lawquo.intelligence',false,'{}')
ON CONFLICT (blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

CREATE OR REPLACE FUNCTION public.get_control_plane_catalogue()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $
SELECT jsonb_build_object(
 'isPlatformAdmin',public.is_platform_admin(auth.uid()),
 'products',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.name),'[]'::jsonb) FROM public.product_catalogue p WHERE p.status IN ('active','beta')),
 'services',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.family,s.name),'[]'::jsonb) FROM public.service_catalogue s WHERE s.status IN ('active','beta')),
 'dependencies',(SELECT COALESCE(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.service_dependencies d),
 'blueprints',(SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.category,b.name),'[]'::jsonb) FROM public.tenant_blueprints b WHERE b.status='active'),
 'workspaceTypes',(SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.product_key,w.system_workspace DESC,w.name),'[]'::jsonb) FROM public.product_workspace_types w)
);
$;
REVOKE ALL ON FUNCTION public.get_control_plane_catalogue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_control_plane_catalogue() TO authenticated,service_role;

COMMIT;
