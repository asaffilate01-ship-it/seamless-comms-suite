BEGIN;

-- Dishbee Stay accommodation modes share one external product/runtime.
-- These blueprints configure the same Stay engine for hotels, student residences
-- and short-stay/holiday-let hosts rather than forking the codebase.

INSERT INTO public.tenant_blueprints(
  blueprint_key,name,description,country_code,category,status,metadata
) VALUES
('dishbee-stay-student-uk','Dishbee Stay Student · UK',
 'Room/studio QR guest-resident portal for student accommodation with food/essentials, parcels, laundry, maintenance, reception and residence services.',
 'GB','hospitality','active',
 '{"publicBrand":"Dishbee Stay","accommodationType":"student_accommodation","noAppRequired":true,"residentPortal":true}'::jsonb),
('dishbee-stay-host-uk','Dishbee Stay Host · UK',
 'Property/unit QR guest portal for short stays, holiday lets and serviced apartments with food/essentials, digital house guide and host services.',
 'GB','hospitality','active',
 '{"publicBrand":"Dishbee Stay","accommodationType":"short_stay","noAppRequired":true,"digitalHouseGuide":true}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,status=EXCLUDED.status,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
('dishbee-stay-student-uk','dishbee-stay',true,'{"accommodationType":"student_accommodation","verificationMode":"resident_code"}'::jsonb),
('dishbee-stay-host-uk','dishbee-stay',true,'{"accommodationType":"short_stay","verificationMode":"room_pin"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET
  required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
('dishbee-stay-student-uk','dishbee.stay.connect',true,'{"mode":"student"}'::jsonb),
('dishbee-stay-student-uk','omniqora.marketplace',true,'{}'::jsonb),
('dishbee-stay-student-uk','omniqora.geo',true,'{}'::jsonb),
('dishbee-stay-student-uk','omniqora.connect',false,'{}'::jsonb),
('dishbee-stay-student-uk','omniqora.crm',false,'{}'::jsonb),
('dishbee-stay-student-uk','dishbee.buzz',false,'{}'::jsonb),
('dishbee-stay-host-uk','dishbee.stay.connect',true,'{"mode":"host"}'::jsonb),
('dishbee-stay-host-uk','omniqora.marketplace',true,'{}'::jsonb),
('dishbee-stay-host-uk','omniqora.geo',true,'{}'::jsonb),
('dishbee-stay-host-uk','omniqora.delivery-broker',false,'{}'::jsonb),
('dishbee-stay-host-uk','omniqora.connect',false,'{}'::jsonb),
('dishbee-stay-host-uk','dishbee.buzz',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET
  required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.vertical_package_catalogue(
  package_key,name,family,description,status,implementation_status,
  required_services,provider_requirements,capabilities,metadata
) VALUES
('hospitality.student-accommodation','Student Accommodation','hospitality',
 'No-download room/studio QR resident portal for food, groceries, parcels, laundry, maintenance, reception, cleaning and residence services.',
 'active','external_product',
 ARRAY['dishbee.stay.connect','omniqora.marketplace','omniqora.geo'],
 ARRAY[]::text[],
 ARRAY['unit_qr','resident_session','food_and_essentials','parcel_help','laundry','maintenance','reception','residence_services'],
 '{"publicProduct":"Dishbee Stay","accommodationType":"student_accommodation"}'::jsonb),
('hospitality.short-stay','Short Stay & Holiday Let Hosts','hospitality',
 'No-download property/unit QR guest portal with food/essentials, digital house guide, host requests, check-in/out, parking and local services.',
 'active','external_product',
 ARRAY['dishbee.stay.connect','omniqora.marketplace','omniqora.geo'],
 ARRAY[]::text[],
 ARRAY['unit_qr','guest_session','food_and_essentials','digital_house_guide','host_help','late_checkout','parking','local_guide'],
 '{"publicProduct":"Dishbee Stay","accommodationType":"short_stay","targetExamples":["short-stay hosts","holiday lets","serviced apartments"]}'::jsonb)
ON CONFLICT(package_key) DO UPDATE SET
  name=EXCLUDED.name,family=EXCLUDED.family,description=EXCLUDED.description,
  status=EXCLUDED.status,implementation_status=EXCLUDED.implementation_status,
  required_services=EXCLUDED.required_services,provider_requirements=EXCLUDED.provider_requirements,
  capabilities=EXCLUDED.capabilities,metadata=EXCLUDED.metadata,updated_at=now();

UPDATE public.product_catalogue
SET metadata=metadata||'{"accommodationModes":["hotel","student_accommodation","serviced_apartment","short_stay","holiday_let"]}'::jsonb,
    updated_at=now()
WHERE product_key='dishbee-stay';

COMMIT;
