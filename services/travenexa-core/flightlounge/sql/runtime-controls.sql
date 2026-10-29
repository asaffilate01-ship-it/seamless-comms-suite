-- Explicit gateway-host provisioning, never automatically applied at startup.
-- No approval, quota or activation records are seeded. Use a private server DB role.
BEGIN;
CREATE SCHEMA IF NOT EXISTS flightlounge_private;
REVOKE ALL ON SCHEMA flightlounge_private FROM PUBLIC;
CREATE TABLE flightlounge_private.budgets (
  tenant_id text NOT NULL,
  subject text NOT NULL, -- '*' for tenant aggregate; otherwise verified actor ID
  remaining integer NOT NULL CHECK (remaining >= 0),
  valid_until timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, subject)
);
CREATE TABLE flightlounge_private.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON flightlounge_private.audit (tenant_id, actor_id, created_at);
ALTER TABLE flightlounge_private.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE flightlounge_private.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA flightlounge_private FROM PUBLIC;
COMMIT;
