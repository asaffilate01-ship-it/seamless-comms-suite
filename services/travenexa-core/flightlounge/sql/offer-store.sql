-- Optional shared offer store; explicitly provision in the private gateway database.
-- No quota, supplier approval or activation records are seeded.
BEGIN;
CREATE SCHEMA IF NOT EXISTS flightlounge_private;
REVOKE ALL ON SCHEMA flightlounge_private FROM PUBLIC;
CREATE TABLE flightlounge_private.offer_quotas (
  tenant_id text NOT NULL,
  subject text NOT NULL,
  max_records integer NOT NULL CHECK (max_records BETWEEN 0 AND 100000),
  lock_version bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, subject)
);
CREATE TABLE flightlounge_private.offers (
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  offer_ref text NOT NULL CHECK (offer_ref ~ '^offer_[a-f0-9]{32}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=128000),
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, offer_ref),
  CHECK (expires_at > stored_at AND expires_at <= stored_at + interval '30 minutes')
);
CREATE INDEX offers_expiry_idx ON flightlounge_private.offers (tenant_id, expires_at);
ALTER TABLE flightlounge_private.offer_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE flightlounge_private.offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON flightlounge_private.offer_quotas, flightlounge_private.offers FROM PUBLIC;
COMMIT;
