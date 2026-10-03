BEGIN;

-- Reusable Dishbee vertical sales packages. Only Stay and Court are marked as
-- implemented product-boundary packages here; the remaining entries are preview
-- packaging so sales discovery can reuse existing engines without claiming
-- vertical-specific workflows are production-complete.

INSERT INTO public.vertical_package_catalogue(
  package_key,name,family,description,status,implementation_status,
  required_services,provider_requirements,capabilities,metadata
) VALUES
('hospitality.hotel','Hotels & Accommodation','hospitality',
 'Room QR guest services, hotel-owned F&B, external MealDeck/Dishbee+ ordering and optional PMS/folio integration.',
 'active','external_product',
 ARRAY['dishbee.stay.connect','omniqora.marketplace','omniqora.geo'],
 ARRAY[]::text[],
 ARRAY['room_qr','room_service','restaurant_ordering','guest_requests','external_food','pms_boundary'],
 '{"publicProduct":"Dishbee Stay","standardUpgrade":"dishbee.stay"}'::jsonb),

('hospitality.court','Courts & Institutional Catering','hospitality',
 'Single-till institutional catering with audience menus, juror allowances, internal handoff and authorised account tabs.',
 'active','external_product',
 ARRAY['dishbee.one','dishbee.court-pack','omniqora.payments'],
 ARRAY[]::text[],
 ARRAY['audience_menus','voucher_allowances','account_tabs','internal_handoff','audit_reporting'],
 '{"publicProduct":"Dishbee One","addon":"Dishbee Court Pack"}'::jsonb),

('hospitality.workplace','Workplace & Corporate Catering','hospitality',
 'Office canteens, staff cafés and workplace ordering with company accounts, scheduled/group ordering and collection.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','omniqora.payments','omniqora.crm'],
 ARRAY[]::text[],
 ARRAY['employee_ordering','company_accounts','group_orders','scheduled_orders','pickup','internal_delivery'],
 '{"targetExamples":["offices","business parks","staff canteens"]}'::jsonb),

('hospitality.education','Education Catering','hospitality',
 'University, college and school food-service package using kiosks, QR, prepaid/allowance accounts and multi-outlet operations.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','omniqora.payments','omniqora.identity'],
 ARRAY[]::text[],
 ARRAY['kiosk','qr_ordering','meal_allowance','prepaid_value','multi_outlet','collection'],
 '{"targetExamples":["universities","colleges","schools"],"safeguardingReviewRequired":true}'::jsonb),

('hospitality.healthcare','Healthcare Catering','hospitality',
 'Non-clinical hospital/clinic staff and visitor food ordering plus ward/internal delivery primitives.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','omniqora.payments','omniqora.delivery-broker'],
 ARRAY[]::text[],
 ARRAY['staff_ordering','visitor_ordering','internal_delivery','dietary_flags','scheduled_orders'],
 '{"targetExamples":["hospitals","clinics"],"clinicalNutritionNotIncluded":true}'::jsonb),

('hospitality.care-home','Care Home Food Service','hospitality',
 'Resident/staff meal ordering, kitchen production, dietary/allergen records and service evidence without clinical nutrition claims.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','haccora.compliance','omniqora.documents'],
 ARRAY[]::text[],
 ARRAY['resident_meals','staff_meals','dietary_flags','kds','food_safety','scheduled_service'],
 '{"clinicalNutritionNotIncluded":true}'::jsonb),

('hospitality.cinema','Cinema & Theatre','hospitality',
 'Seat/zone ordering, pre-order, pickup, kiosk and concessions operation.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','omniqora.payments','omniqora.geo'],
 ARRAY[]::text[],
 ARRAY['seat_delivery','preorder','kiosk','concessions','pickup','event_service_windows'],
 '{"targetExamples":["cinemas","theatres"]}'::jsonb),

('hospitality.stadium','Stadiums, Arenas & Large Venues','hospitality',
 'High-volume concessions, kiosks, stand/section pickup, multi-vendor coordination and capacity controls.',
 'preview','catalogue_only',
 ARRAY['dishbee.hive','omniqora.payments','omniqora.geo','omniqora.dispatch'],
 ARRAY[]::text[],
 ARRAY['multi_vendor','high_volume_kiosk','section_pickup','capacity','central_pass','internal_dispatch'],
 '{"targetExamples":["stadiums","arenas","exhibition centres"]}'::jsonb),

('hospitality.travel-hub','Travel Hubs & Lounges','hospitality',
 'Airport/rail lounge and travel-hub ordering with table/seat/gate handoff, multi-vendor options and service windows.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','omniqora.payments','omniqora.geo'],
 ARRAY[]::text[],
 ARRAY['lounge_ordering','seat_handoff','pickup','multi_outlet','scheduled_service'],
 '{"targetExamples":["airport lounges","rail lounges","service stations"]}'::jsonb),

('hospitality.resort','Resorts, Holiday Parks & Serviced Accommodation','hospitality',
 'Property guest portal plus multi-outlet food, room/unit delivery, activities/service requests and external marketplace access.',
 'preview','catalogue_only',
 ARRAY['dishbee.stay.connect','omniqora.marketplace','omniqora.geo','omniqora.delivery-broker'],
 ARRAY[]::text[],
 ARRAY['unit_qr','multi_outlet','guest_requests','external_food','property_delivery'],
 '{"targetExamples":["resorts","holiday parks","serviced apartments"]}'::jsonb),

('hospitality.pub-bar','Pubs, Bars & Social Venues','hospitality',
 'Table ordering, tabs, QR pay, KDS/bar routing, loyalty and events.',
 'preview','catalogue_only',
 ARRAY['dishbee.one','omniqora.payments','omniqora.crm'],
 ARRAY[]::text[],
 ARRAY['table_ordering','tabs','qr_pay','bar_routing','loyalty','events'],
 '{"regulatedAlcoholWorkflowRequiredWhereApplicable":true}'::jsonb),

('hospitality.food-hall','Food Halls & Markets','hospitality',
 'Multi-operator venue ordering with one customer basket, vendor KDS, central pass, kiosks and split settlement.',
 'active','external_product',
 ARRAY['dishbee.hive','dishbee.hive-kiosk','omniqora.payments'],
 ARRAY[]::text[],
 ARRAY['multi_vendor','one_basket','split_settlement','vendor_kds','central_pass','venue_kiosk'],
 '{"publicProduct":"Dishbee Hive"}'::jsonb)

ON CONFLICT(package_key) DO UPDATE SET
  name=EXCLUDED.name,family=EXCLUDED.family,description=EXCLUDED.description,
  status=EXCLUDED.status,implementation_status=EXCLUDED.implementation_status,
  required_services=EXCLUDED.required_services,provider_requirements=EXCLUDED.provider_requirements,
  capabilities=EXCLUDED.capabilities,metadata=EXCLUDED.metadata,updated_at=now();

COMMIT;
