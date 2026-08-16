INSERT INTO public.tenants (id, name, slug)
VALUES ('11111111-1111-4111-8111-111111111111', 'Beauty Studio München (Demo)', 'demo-beauty-muenchen')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
  ('11111111-1111-4111-8111-111111111111', '18bafcd5-3e4c-4044-bb63-10325a0b7209', 'owner'),
  ('11111111-1111-4111-8111-111111111111', 'e66c0525-1787-4250-be26-79f849624521', 'admin'),
  ('11111111-1111-4111-8111-111111111111', '890c71b1-cf6e-4b68-a56e-dd6050372481', 'agent'),
  ('11111111-1111-4111-8111-111111111111', '97319fe5-82fd-44cd-b27d-6ae314ee368b', 'viewer')
ON CONFLICT DO NOTHING;

INSERT INTO public.contacts (id, tenant_id, wa_id, display_name, locale, consent_marketing) VALUES
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111', '4915112345678', 'Lena Hoffmann', 'de', true),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111111', '4917098765432', 'Murat Yildiz', 'de', false),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111111', '4915987654321', 'Sofia Rossi', 'en', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.conversations (id, tenant_id, contact_id, status, last_message_at, last_inbound_at) VALUES
  ('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222201', 'open', now() - interval '12 minutes', now() - interval '12 minutes'),
  ('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222202', 'open', now() - interval '3 hours', now() - interval '3 hours'),
  ('33333333-3333-4333-8333-333333333303', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222203', 'open', now() - interval '2 days', now() - interval '2 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (id, tenant_id, conversation_id, direction, msg_type, body, status, created_at) VALUES
  ('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'inbound', 'text', 'Hallo, habt ihr am Samstag noch einen Termin für Balayage frei?', 'received', now() - interval '20 minutes'),
  ('44444444-4444-4444-8444-444444444402', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'outbound', 'text', 'Guten Tag Frau Hoffmann! Samstag 14:30 Uhr wäre frei — passt das?', 'delivered', now() - interval '15 minutes'),
  ('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'inbound', 'text', 'Perfekt, bitte reservieren.', 'received', now() - interval '12 minutes'),
  ('44444444-4444-4444-8444-444444444404', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333302', 'inbound', 'text', 'Was kostet ein Herrenhaarschnitt inkl. Bart?', 'received', now() - interval '3 hours'),
  ('44444444-4444-4444-8444-444444444405', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333303', 'inbound', 'text', 'Hi! Do you offer gift vouchers in English?', 'received', now() - interval '2 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.cases (id, tenant_id, conversation_id, title, status, priority) VALUES
  ('55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'Balayage Samstag 14:30 — Reservierung bestätigen', 'scheduled', 'normal'),
  ('55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333302', 'Preisanfrage Herrenhaarschnitt + Bart', 'qualifying', 'low'),
  ('55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333303', 'Gift voucher request (EN)', 'new', 'normal')
ON CONFLICT DO NOTHING;