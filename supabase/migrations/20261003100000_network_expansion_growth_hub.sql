-- Reusable franchise / network expansion and acquisition engine.
BEGIN;

CREATE TABLE IF NOT EXISTS public.network_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,
 programme_key text NOT NULL,name text NOT NULL,
 model_type text NOT NULL DEFAULT 'franchise' CHECK(model_type IN('franchise','dealer','agency','operator','reseller','partner')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','closed','archived')),
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 fee_min_minor bigint NOT NULL DEFAULT 0,fee_max_minor bigint NOT NULL DEFAULT 0,
 royalty_bps integer NOT NULL DEFAULT 0 CHECK(royalty_bps BETWEEN 0 AND 10000),
 marketing_bps integer NOT NULL DEFAULT 0 CHECK(marketing_bps BETWEEN 0 AND 10000),
 tech_fee_minor_per_order integer NOT NULL DEFAULT 0,
 supply_markup_bps integer NOT NULL DEFAULT 0 CHECK(supply_markup_bps BETWEEN 0 AND 10000),
 offer jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,programme_key)
);

CREATE TABLE IF NOT EXISTS public.network_territory_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_key text NOT NULL,ordinal integer NOT NULL,territory_code text NOT NULL,
 name text NOT NULL,region text NOT NULL,fee_minor bigint NOT NULL DEFAULT 0,currency text NOT NULL DEFAULT 'GBP',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,UNIQUE(template_key,territory_code),UNIQUE(template_key,ordinal)
);

CREATE TABLE IF NOT EXISTS public.network_territories(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.network_programmes(id) ON DELETE CASCADE,
 territory_code text NOT NULL,name text NOT NULL,region text NOT NULL,
 status text NOT NULL DEFAULT 'available' CHECK(status IN('available','coming_soon','held','reserved','taken','onboarding','operating','paused','retired')),
 fee_minor bigint NOT NULL DEFAULT 0,currency text NOT NULL DEFAULT 'GBP',territory_tier text,territory_score numeric,
 resident_population integer,effective_population integer,households integer,daytime_population integer,students integer,
 centre_lat double precision,centre_lng double precision,protected_geojson jsonb,shared_geojson jsonb,overflow_geojson jsonb,
 is_public boolean NOT NULL DEFAULT true,is_sellable boolean NOT NULL DEFAULT true,public_note text,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 reserved_until timestamptz,operator_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(programme_id,territory_code)
);

CREATE TABLE IF NOT EXISTS public.network_applications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.network_programmes(id) ON DELETE CASCADE,territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,
 crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,crm_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
 applicant_name text NOT NULL,email text NOT NULL,phone_e164 text,preferred_area text,existing_kitchen boolean NOT NULL DEFAULT false,
 existing_business text,available_capital_minor bigint,launch_timing text,multi_unit_interest boolean NOT NULL DEFAULT false,
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN('new','qualifying','qualified','discovery','due_diligence','agreement','fee_due','paid','onboarding','training','launch_ready','live','declined','withdrawn')),
 score integer CHECK(score IS NULL OR score BETWEEN 0 AND 1000),source text,utm jsonb NOT NULL DEFAULT '{}'::jsonb,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,consent boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.network_application_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES public.network_applications(id) ON DELETE CASCADE,event_type text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_channel_catalogue(
 channel_key text PRIMARY KEY,name text NOT NULL,ownership text NOT NULL CHECK(ownership IN('paid','owned','earned','mixed')),
 medium text NOT NULL CHECK(medium IN('digital','direct','referral','media','offline')),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.growth_acquisition_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,programme_id uuid REFERENCES public.network_programmes(id) ON DELETE CASCADE,
 territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,channel_key text NOT NULL REFERENCES public.growth_channel_catalogue(channel_key),
 name text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','planned','running','paused','completed','cancelled')),
 objective text,budget_minor bigint NOT NULL DEFAULT 0,spend_minor bigint NOT NULL DEFAULT 0,currency text NOT NULL DEFAULT 'GBP',
 impressions bigint NOT NULL DEFAULT 0,clicks bigint NOT NULL DEFAULT 0,leads integer NOT NULL DEFAULT 0,qualified integer NOT NULL DEFAULT 0,
 applications integer NOT NULL DEFAULT 0,signed integer NOT NULL DEFAULT 0,revenue_minor bigint NOT NULL DEFAULT 0,start_at timestamptz,end_at timestamptz,
 tracking jsonb NOT NULL DEFAULT '{}'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.growth_content_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,programme_id uuid REFERENCES public.network_programmes(id) ON DELETE CASCADE,
 territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,channel_key text REFERENCES public.growth_channel_catalogue(channel_key),
 content_type text NOT NULL CHECK(content_type IN('landing_page','seo_page','blog','video','short_video','social_post','ad','email','whatsapp','sms','directory_listing','pr','event','outdoor','vehicle_wrap','leaflet','creative')),
 title text NOT NULL,status text NOT NULL DEFAULT 'idea' CHECK(status IN('idea','brief','producing','review','scheduled','published','retired')),
 target_url text,publish_at timestamptz,brief jsonb NOT NULL DEFAULT '{}'::jsonb,metrics jsonb NOT NULL DEFAULT '{}'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.growth_attribution_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,programme_id uuid REFERENCES public.network_programmes(id) ON DELETE CASCADE,
 territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,application_id uuid REFERENCES public.network_applications(id) ON DELETE SET NULL,
 campaign_id uuid REFERENCES public.growth_acquisition_campaigns(id) ON DELETE SET NULL,event_type text NOT NULL,
 channel_key text REFERENCES public.growth_channel_catalogue(channel_key),visitor_ref text,utm jsonb NOT NULL DEFAULT '{}'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 value_minor bigint NOT NULL DEFAULT 0,currency text NOT NULL DEFAULT 'GBP',created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['network_programmes','network_territories','network_applications','network_application_events','growth_acquisition_campaigns','growth_content_items','growth_attribution_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','network tenant read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','network tenant write',t);
 END LOOP;
END $$;

INSERT INTO public.growth_channel_catalogue(channel_key,name,ownership,medium) VALUES
('seo','SEO / organic search','owned','digital'),
('google-search','Google Search Ads','paid','digital'),
('google-pmax','Google Performance Max','paid','digital'),
('google-business','Google Business Profile / Maps','owned','digital'),
('tiktok','TikTok organic & paid','mixed','digital'),
('youtube','YouTube organic & paid','mixed','digital'),
('facebook','Facebook organic & paid','mixed','digital'),
('instagram','Instagram organic & paid','mixed','digital'),
('linkedin','LinkedIn / B2B outreach','mixed','digital'),
('franchise-portals','Franchise portals','paid','digital'),
('free-directories','Free directories','owned','digital'),
('email','Email nurture','owned','direct'),
('whatsapp','WhatsApp nurture','owned','direct'),
('sms','SMS nurture','owned','direct'),
('referral','Franchise / partner referrals','earned','referral'),
('pr','PR & editorial','earned','media'),
('influencers','Creators / influencers','mixed','media'),
('events','Franchise exhibitions / discovery events','paid','offline'),
('outdoor','Outdoor / OOH','paid','offline'),
('vehicle-wraps','Vehicle wraps','owned','offline'),
('leaflets','Leaflets / direct mail','paid','offline'),
('local-partnerships','Local partnerships / community','earned','offline'),
('b2b-kitchen-outreach','Existing restaurant & cloud-kitchen outreach','owned','direct'),
('retargeting','Cross-channel retargeting','paid','digital')
ON CONFLICT(channel_key) DO UPDATE SET name=EXCLUDED.name,ownership=EXCLUDED.ownership,medium=EXCLUDED.medium,status='active';

INSERT INTO public.network_territory_templates(template_key,ordinal,territory_code,name,region,fee_minor) VALUES
('mealdeck-england-wales',1,'MD-001','Islington / Camden','London',2500000),
('mealdeck-england-wales',2,'MD-002','Elephant & Castle / Bermondsey / Southwark','London',2500000),
('mealdeck-england-wales',3,'MD-003','Battersea / Clapham / Vauxhall','London',2500000),
('mealdeck-england-wales',4,'MD-004','Leyton / Stratford','London',2250000),
('mealdeck-england-wales',5,'MD-005','Lewisham / Deptford / Greenwich West','London',2250000),
('mealdeck-england-wales',6,'MD-006','Alperton / Wembley / Park Royal','London',2250000),
('mealdeck-england-wales',7,'MD-007','Southall / Hayes','London',2000000),
('mealdeck-england-wales',8,'MD-008','Edmonton / Tottenham / Enfield South','London',2000000),
('mealdeck-england-wales',9,'MD-009','Barking / Ilford','London',2000000),
('mealdeck-england-wales',10,'MD-010','Thornton Heath / Croydon','London',2000000),
('mealdeck-england-wales',11,'MD-011','Birmingham Central / Aston / Nechells','West Midlands & Marches',2250000),
('mealdeck-england-wales',12,'MD-012','Bournville / Stirchley / Selly Oak','West Midlands & Marches',2000000),
('mealdeck-england-wales',13,'MD-013','West Bromwich / Smethwick','West Midlands & Marches',1750000),
('mealdeck-england-wales',14,'MD-014','Tipton / Dudley Port','West Midlands & Marches',1500000),
('mealdeck-england-wales',15,'MD-015','Dudley / Netherton / Brierley Hill','West Midlands & Marches',1500000),
('mealdeck-england-wales',16,'MD-016','Stourbridge / Lye','West Midlands & Marches',1250000),
('mealdeck-england-wales',17,'MD-017','Halesowen / Blackheath','West Midlands & Marches',1250000),
('mealdeck-england-wales',18,'MD-018','Wolverhampton / Bilston','West Midlands & Marches',1750000),
('mealdeck-england-wales',19,'MD-019','Walsall / Great Barr','West Midlands & Marches',1750000),
('mealdeck-england-wales',20,'MD-020','Solihull / Sheldon','West Midlands & Marches',2000000),
('mealdeck-england-wales',21,'MD-021','Coventry','West Midlands & Marches',1750000),
('mealdeck-england-wales',22,'MD-022','Worcester','West Midlands & Marches',1250000),
('mealdeck-england-wales',23,'MD-023','Redditch / Bromsgrove','West Midlands & Marches',1250000),
('mealdeck-england-wales',24,'MD-024','Kidderminster / Stourport','West Midlands & Marches',1000000),
('mealdeck-england-wales',25,'MD-025','Telford','West Midlands & Marches',1250000),
('mealdeck-england-wales',26,'MD-026','Shrewsbury','West Midlands & Marches',1000000),
('mealdeck-england-wales',27,'MD-027','Hereford','West Midlands & Marches',750000),
('mealdeck-england-wales',28,'MD-028','Derby','East Midlands',1500000),
('mealdeck-england-wales',29,'MD-029','Nottingham Central / South','East Midlands',2000000),
('mealdeck-england-wales',30,'MD-030','Nottingham North / Arnold','East Midlands',1500000),
('mealdeck-england-wales',31,'MD-031','Mansfield / Sutton-in-Ashfield','East Midlands',1250000),
('mealdeck-england-wales',32,'MD-032','Chesterfield','East Midlands',1000000),
('mealdeck-england-wales',33,'MD-033','Loughborough','East Midlands',1000000),
('mealdeck-england-wales',34,'MD-034','Leicester North / Central','East Midlands',2000000),
('mealdeck-england-wales',35,'MD-035','Leicester South / Oadby / Wigston','East Midlands',1750000),
('mealdeck-england-wales',36,'MD-036','Kettering','East Midlands',1250000),
('mealdeck-england-wales',37,'MD-037','Corby','East Midlands',1000000),
('mealdeck-england-wales',38,'MD-038','Wellingborough / Rushden','East Midlands',1000000),
('mealdeck-england-wales',39,'MD-039','Northampton','East Midlands',1750000),
('mealdeck-england-wales',40,'MD-040','Lincoln','East Midlands',1250000),
('mealdeck-england-wales',41,'MD-041','Manchester Central / Salford','North West',2500000),
('mealdeck-england-wales',42,'MD-042','Trafford / Altrincham','North West',1750000),
('mealdeck-england-wales',43,'MD-043','Stockport / South Manchester','North West',2000000),
('mealdeck-england-wales',44,'MD-044','Oldham','North West',1250000),
('mealdeck-england-wales',45,'MD-045','Rochdale','North West',1250000),
('mealdeck-england-wales',46,'MD-046','Bolton','North West',1500000),
('mealdeck-england-wales',47,'MD-047','Bury','North West',1250000),
('mealdeck-england-wales',48,'MD-048','Wigan','North West',1250000),
('mealdeck-england-wales',49,'MD-049','Warrington','North West',1500000),
('mealdeck-england-wales',50,'MD-050','Crewe / Nantwich','North West',1000000),
('mealdeck-england-wales',51,'MD-051','Macclesfield','North West',1000000),
('mealdeck-england-wales',52,'MD-052','Stoke-on-Trent / Newcastle-under-Lyme','North West',1500000),
('mealdeck-england-wales',53,'MD-053','Chester','North West',1250000),
('mealdeck-england-wales',54,'MD-054','Liverpool Central / East','North West',2250000),
('mealdeck-england-wales',55,'MD-055','Liverpool North / Bootle','North West',1750000),
('mealdeck-england-wales',56,'MD-056','Birkenhead / Wallasey','North West',1500000),
('mealdeck-england-wales',57,'MD-057','St Helens','North West',1250000),
('mealdeck-england-wales',58,'MD-058','Southport','North West',1000000),
('mealdeck-england-wales',59,'MD-059','Preston','North West',1500000),
('mealdeck-england-wales',60,'MD-060','Blackburn / Darwen','North West',1250000),
('mealdeck-england-wales',61,'MD-061','Burnley / Nelson','North West',1000000),
('mealdeck-england-wales',62,'MD-062','Blackpool / Fylde','North West',1250000),
('mealdeck-england-wales',63,'MD-063','Lancaster / Morecambe','North West',1000000),
('mealdeck-england-wales',64,'MD-064','Leeds Central / East','Yorkshire & Humber',2250000),
('mealdeck-england-wales',65,'MD-065','Leeds North / West','Yorkshire & Humber',2000000),
('mealdeck-england-wales',66,'MD-066','Bradford','Yorkshire & Humber',1750000),
('mealdeck-england-wales',67,'MD-067','Halifax','Yorkshire & Humber',1250000),
('mealdeck-england-wales',68,'MD-068','Huddersfield','Yorkshire & Humber',1500000),
('mealdeck-england-wales',69,'MD-069','Wakefield','Yorkshire & Humber',1250000),
('mealdeck-england-wales',70,'MD-070','York','Yorkshire & Humber',1750000),
('mealdeck-england-wales',71,'MD-071','Harrogate','Yorkshire & Humber',1250000),
('mealdeck-england-wales',72,'MD-072','Sheffield Central / South','Yorkshire & Humber',2000000),
('mealdeck-england-wales',73,'MD-073','Sheffield North / East','Yorkshire & Humber',1750000),
('mealdeck-england-wales',74,'MD-074','Rotherham','Yorkshire & Humber',1250000),
('mealdeck-england-wales',75,'MD-075','Barnsley','Yorkshire & Humber',1250000),
('mealdeck-england-wales',76,'MD-076','Doncaster','Yorkshire & Humber',1500000),
('mealdeck-england-wales',77,'MD-077','Hull','Yorkshire & Humber',1500000),
('mealdeck-england-wales',78,'MD-078','Scunthorpe','Yorkshire & Humber',750000),
('mealdeck-england-wales',79,'MD-079','Grimsby / Cleethorpes','Yorkshire & Humber',1000000),
('mealdeck-england-wales',80,'MD-080','Scarborough','Yorkshire & Humber',750000),
('mealdeck-england-wales',81,'MD-081','Newcastle / Gateshead','North East & Cumbria',2000000),
('mealdeck-england-wales',82,'MD-082','North Shields / Tynemouth','North East & Cumbria',1250000),
('mealdeck-england-wales',83,'MD-083','South Shields','North East & Cumbria',1000000),
('mealdeck-england-wales',84,'MD-084','Sunderland','North East & Cumbria',1500000),
('mealdeck-england-wales',85,'MD-085','Durham','North East & Cumbria',1000000),
('mealdeck-england-wales',86,'MD-086','Middlesbrough / Teesside','North East & Cumbria',1500000),
('mealdeck-england-wales',87,'MD-087','Darlington','North East & Cumbria',1000000),
('mealdeck-england-wales',88,'MD-088','Carlisle','North East & Cumbria',750000),
('mealdeck-england-wales',89,'MD-089','Kendal','North East & Cumbria',750000),
('mealdeck-england-wales',90,'MD-090','Barrow-in-Furness','North East & Cumbria',750000),
('mealdeck-england-wales',91,'MD-091','Workington / Whitehaven','North East & Cumbria',750000),
('mealdeck-england-wales',92,'MD-092','Peterborough','East Anglia',1250000),
('mealdeck-england-wales',93,'MD-093','Cambridge','East Anglia',1750000),
('mealdeck-england-wales',94,'MD-094','Norwich','East Anglia',1500000),
('mealdeck-england-wales',95,'MD-095','Great Yarmouth / Lowestoft','East Anglia',1000000),
('mealdeck-england-wales',96,'MD-096','King''s Lynn','East Anglia',750000),
('mealdeck-england-wales',97,'MD-097','Bury St Edmunds','East Anglia',1000000),
('mealdeck-england-wales',98,'MD-098','Ipswich','East Anglia',1250000),
('mealdeck-england-wales',99,'MD-099','Colchester','East Anglia',1500000),
('mealdeck-england-wales',100,'MD-100','Chelmsford','East Anglia',1750000),
('mealdeck-england-wales',101,'MD-101','Southend-on-Sea','East Anglia',1500000),
('mealdeck-england-wales',102,'MD-102','Basildon','East Anglia',1500000),
('mealdeck-england-wales',103,'MD-103','Harlow','East Anglia',1500000),
('mealdeck-england-wales',104,'MD-104','Milton Keynes','Thames Valley & Home Counties',1750000),
('mealdeck-england-wales',105,'MD-105','Bedford','Thames Valley & Home Counties',1250000),
('mealdeck-england-wales',106,'MD-106','Luton / Dunstable','Thames Valley & Home Counties',1750000),
('mealdeck-england-wales',107,'MD-107','Stevenage','Thames Valley & Home Counties',1250000),
('mealdeck-england-wales',108,'MD-108','Watford','Thames Valley & Home Counties',2000000),
('mealdeck-england-wales',109,'MD-109','Aylesbury','Thames Valley & Home Counties',1250000),
('mealdeck-england-wales',110,'MD-110','High Wycombe','Thames Valley & Home Counties',1500000),
('mealdeck-england-wales',111,'MD-111','Oxford','Thames Valley & Home Counties',2000000),
('mealdeck-england-wales',112,'MD-112','Banbury','Thames Valley & Home Counties',1000000),
('mealdeck-england-wales',113,'MD-113','Reading','Thames Valley & Home Counties',1750000),
('mealdeck-england-wales',114,'MD-114','Slough / Maidenhead','Thames Valley & Home Counties',2000000),
('mealdeck-england-wales',115,'MD-115','Bracknell / Wokingham','Thames Valley & Home Counties',1500000),
('mealdeck-england-wales',116,'MD-116','Swindon','Thames Valley & Home Counties',1500000),
('mealdeck-england-wales',117,'MD-117','Bristol North / East','South West',2000000),
('mealdeck-england-wales',118,'MD-118','Bristol South / Bedminster','South West',1750000),
('mealdeck-england-wales',119,'MD-119','Bath','South West',1500000),
('mealdeck-england-wales',120,'MD-120','Gloucester','South West',1250000),
('mealdeck-england-wales',121,'MD-121','Cheltenham','South West',1500000),
('mealdeck-england-wales',122,'MD-122','Weston-super-Mare','South West',1000000),
('mealdeck-england-wales',123,'MD-123','Bridgwater','South West',1000000),
('mealdeck-england-wales',124,'MD-124','Taunton','South West',1000000),
('mealdeck-england-wales',125,'MD-125','Yeovil','South West',750000),
('mealdeck-england-wales',126,'MD-126','Exeter','South West',1250000),
('mealdeck-england-wales',127,'MD-127','Torquay / Newton Abbot','South West',1000000),
('mealdeck-england-wales',128,'MD-128','Plymouth','South West',1250000),
('mealdeck-england-wales',129,'MD-129','Truro / Central Cornwall','South West',750000),
('mealdeck-england-wales',130,'MD-130','Newport','Wales',1250000),
('mealdeck-england-wales',131,'MD-131','Cardiff Central / East','Wales',1750000),
('mealdeck-england-wales',132,'MD-132','Cardiff West / Vale','Wales',1500000),
('mealdeck-england-wales',133,'MD-133','Bridgend','Wales',1000000),
('mealdeck-england-wales',134,'MD-134','Swansea','Wales',1250000),
('mealdeck-england-wales',135,'MD-135','Llanelli / Carmarthen','Wales',750000),
('mealdeck-england-wales',136,'MD-136','Wrexham','Wales',1000000),
('mealdeck-england-wales',137,'MD-137','Bangor / North Wales Coast','Wales',750000),
('mealdeck-england-wales',138,'MD-138','Southampton','South & South East',1750000),
('mealdeck-england-wales',139,'MD-139','Portsmouth','South & South East',1500000),
('mealdeck-england-wales',140,'MD-140','Bournemouth / Poole','South & South East',1500000),
('mealdeck-england-wales',141,'MD-141','Basingstoke','South & South East',1500000),
('mealdeck-england-wales',142,'MD-142','Guildford / Woking','South & South East',1750000),
('mealdeck-england-wales',143,'MD-143','Crawley / Gatwick / Redhill','South & South East',1750000),
('mealdeck-england-wales',144,'MD-144','Brighton / Hove','South & South East',1750000),
('mealdeck-england-wales',145,'MD-145','Worthing','South & South East',1250000),
('mealdeck-england-wales',146,'MD-146','Eastbourne','South & South East',1000000),
('mealdeck-england-wales',147,'MD-147','Hastings / Bexhill','South & South East',1000000),
('mealdeck-england-wales',148,'MD-148','Dartford / Gravesend','South & South East',1500000),
('mealdeck-england-wales',149,'MD-149','Medway / Maidstone','South & South East',1500000),
('mealdeck-england-wales',150,'MD-150','Canterbury / Ashford / Folkestone','South & South East',1250000)
ON CONFLICT(template_key,territory_code) DO UPDATE SET ordinal=EXCLUDED.ordinal,name=EXCLUDED.name,region=EXCLUDED.region,fee_minor=EXCLUDED.fee_minor,currency='GBP';

-- Public labels and rollout rules. "Taken" deliberately does not expose ownership type.
UPDATE public.network_territory_templates SET metadata=metadata||'{"publicStatus":"taken","isSellable":false}'::jsonb
WHERE template_key='mealdeck-england-wales' AND name IN('Bedford','Milton Keynes');
UPDATE public.network_territory_templates SET metadata=metadata||'{"publicStatus":"coming_soon","isSellable":false,"publicNote":"Coming soon"}'::jsonb
WHERE template_key='mealdeck-england-wales' AND name='Luton / Dunstable';
UPDATE public.network_territory_templates SET metadata=metadata||'{"publicStatus":"taken","isSellable":false,"anchor":"Caledonian Road","publicNote":"Taken","centrePostcode":"N7 8XH","centreLat":51.54323,"centreLng":-0.114474,"territoryDesign":{"coreDriveMinutes":25,"sharedDriveMinutes":30,"overflowMaxMinutes":35,"suggestedCoreAreas":["Barnsbury","Caledonian Road","South Holloway","West Highbury","West Canonbury","North King''s Cross","North Angel","East Camden Town","South Kentish Town","South Tufnell Park"],"rule":"Protected polygon is distinct from operational delivery zones; whole postcode districts are not granted automatically."}}'::jsonb
WHERE template_key='mealdeck-england-wales' AND name='Islington / Camden';

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status) VALUES
('omniqora.network-expansion','Network Expansion','Reusable franchise, dealer, agency, operator and partner territory expansion engine.','growth','omniqora',true,'automatic','active','built_main'),
('omniqora.attribution','Growth Attribution','Cross-channel acquisition, content and signed-network attribution.','growth','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET description=EXCLUDED.description,implementation_status='built_main',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.network-expansion','omniqora.crm'),('omniqora.network-expansion','omniqora.geo'),
('omniqora.attribution','omniqora.campaigns'),('omniqora.attribution','omniqora.analytics')
ON CONFLICT DO NOTHING;
INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('mealdeck','omniqora.network-expansion',true,true),('mealdeck','omniqora.attribution',true,true)
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=true,required=true;
INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
SELECT 'mealdeck-uk',x.service_key,true,'{}'::jsonb
FROM (VALUES('omniqora.network-expansion'),('omniqora.attribution')) x(service_key)
WHERE EXISTS(SELECT 1 FROM public.tenant_blueprints WHERE blueprint_key='mealdeck-uk')
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=true;

CREATE OR REPLACE FUNCTION public.network_seed_mealdeck_programme(_tenant uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p uuid;t record;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN RAISE EXCEPTION 'Network expansion access denied';END IF;
 INSERT INTO public.network_programmes(tenant_id,product_key,programme_key,name,model_type,status,currency,fee_min_minor,fee_max_minor,royalty_bps,marketing_bps,tech_fee_minor_per_order,supply_markup_bps,offer)
 VALUES(_tenant,'mealdeck','mealdeck-england-wales','MealDeck England & Wales','franchise','active','GBP',750000,2500000,550,150,25,1000,
 jsonb_build_object(
  'brands','15+ and growing','positioning','One kitchen. 15+ brands. One technology platform. One protected territory.',
  'featuredMarkets',jsonb_build_array(
   jsonb_build_object('name','Luton','status','coming_soon'),
   jsonb_build_object('name','St Albans','status','coming_soon'),
   jsonb_build_object('name','Bedford','status','taken'),
   jsonb_build_object('name','Milton Keynes','status','taken'),
   jsonb_build_object('name','Islington / Camden','status','taken','note','Taken')
  ),
  'franchisorProvides',jsonb_build_array('15+ MealDeck brands','Dishbee hospitality operating system','Omniqora intelligence and control plane','KDS/order orchestration','delivery integrations','national and local marketing','training','admin and ongoing support','central production and supply'),
  'franchiseeFunds',jsonb_build_array('franchise fee','rent and premises costs','staff and payroll','utilities','opening and ongoing stock','food and packaging purchases','missing kitchen equipment','KDS screen and printer where required','local operating costs and working capital')
 ))
 ON CONFLICT(tenant_id,programme_key) DO UPDATE SET status='active',royalty_bps=550,marketing_bps=150,tech_fee_minor_per_order=25,supply_markup_bps=1000,fee_min_minor=750000,fee_max_minor=2500000,offer=EXCLUDED.offer,updated_at=now()
 RETURNING id INTO p;

 FOR t IN SELECT * FROM public.network_territory_templates WHERE template_key='mealdeck-england-wales' ORDER BY ordinal LOOP
  INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,status,fee_minor,currency,is_sellable,public_note,metadata)
  VALUES(_tenant,p,t.territory_code,t.name,t.region,
    COALESCE(t.metadata->>'publicStatus','available'),
    t.fee_minor,t.currency,COALESCE((t.metadata->>'isSellable')::boolean,true),t.metadata->>'publicNote',t.metadata)
  ON CONFLICT(programme_id,territory_code) DO UPDATE SET name=EXCLUDED.name,region=EXCLUDED.region,fee_minor=EXCLUDED.fee_minor,
    status=CASE WHEN public.network_territories.status IN('reserved','taken','onboarding','operating') THEN public.network_territories.status ELSE EXCLUDED.status END,
    is_sellable=EXCLUDED.is_sellable,public_note=EXCLUDED.public_note,metadata=public.network_territories.metadata||EXCLUDED.metadata,updated_at=now();
 END LOOP;
 RETURN p;
END;$$;
REVOKE ALL ON FUNCTION public.network_seed_mealdeck_programme(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.network_seed_mealdeck_programme(uuid) TO authenticated,service_role;

-- Seed immediately when the MealDeck pilot tenant already exists.
DO $$ DECLARE tid uuid;BEGIN
 SELECT id INTO tid FROM public.tenants WHERE slug='mealdeck';
 IF tid IS NOT NULL THEN
  INSERT INTO public.network_programmes(tenant_id,product_key,programme_key,name,model_type,status,currency,fee_min_minor,fee_max_minor,royalty_bps,marketing_bps,tech_fee_minor_per_order,supply_markup_bps,offer)
  VALUES(tid,'mealdeck','mealdeck-england-wales','MealDeck England & Wales','franchise','active','GBP',750000,2500000,550,150,25,1000,
   '{"brands":"15+ and growing","featuredMarkets":[{"name":"Luton","status":"coming_soon"},{"name":"St Albans","status":"coming_soon"},{"name":"Bedford","status":"taken"},{"name":"Milton Keynes","status":"taken"},{"name":"Islington / Camden","status":"taken","note":"Taken"}]}'::jsonb)
  ON CONFLICT(tenant_id,programme_key) DO NOTHING;
  INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,status,fee_minor,currency,is_sellable,public_note,metadata)
  SELECT tid,p.id,t.territory_code,t.name,t.region,COALESCE(t.metadata->>'publicStatus','available'),t.fee_minor,t.currency,
         COALESCE((t.metadata->>'isSellable')::boolean,true),t.metadata->>'publicNote',t.metadata
  FROM public.network_programmes p CROSS JOIN public.network_territory_templates t
  WHERE p.tenant_id=tid AND p.programme_key='mealdeck-england-wales' AND t.template_key='mealdeck-england-wales'
  ON CONFLICT(programme_id,territory_code) DO NOTHING;

  INSERT INTO public.tenant_services(tenant_id,service_key,status,source,config)
  VALUES
    (tid,'omniqora.network-expansion','active','migration','{}'::jsonb),
    (tid,'omniqora.attribution','active','migration','{}'::jsonb)
  ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active',source='migration',updated_at=now();
 END IF;
END $;

COMMIT;