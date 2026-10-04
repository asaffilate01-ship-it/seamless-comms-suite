import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const migrationNames = (await readdir(migrations)).filter((entry) => entry.endsWith(".sql")).sort();
const snapshotServer = await readFile(
  new URL("../../src/modules/control-plane/control-plane.server.ts", import.meta.url),
  "utf8",
);
const migrationVersions = migrationNames.map((name) => name.split("_")[0]);
assert.equal(
  new Set(migrationVersions).size,
  migrationVersions.length,
  "Supabase migration versions must be unique",
);
assert.match(snapshotServer, /schemaVersion:\s*4/);
assert.match(snapshotServer, /\.from\("tenant_brands"\)/);
assert.match(snapshotServer, /\.from\("tenant_locations"\)/);
assert.match(snapshotServer, /\n\s+brands,\n\s+locations,/);
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);

for (const name of migrationNames) {
  const sql = await readFile(new URL(name, migrations), "utf8");
  if (name.startsWith("20260816120554")) {
    for (const id of [
      "18bafcd5-3e4c-4044-bb63-10325a0b7209",
      "e66c0525-1787-4250-be26-79f849624521",
      "890c71b1-cf6e-4b68-a56e-dd6050372481",
      "97319fe5-82fd-44cd-b27d-6ae314ee368b",
    ])
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        id,
        "fixture@example.invalid",
      ]);
  }
  await db.exec(sql);
}

const admin = "f1000000-0000-4000-8000-000000000001";
const stranger = "f1000000-0000-4000-8000-000000000002";
for (const id of [admin, stranger])
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, `${id}@example.invalid`]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);

async function asUser(user, action) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const value = await action();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
async function asService(action) {
  await db.exec("BEGIN; SET LOCAL ROLE service_role;");
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
  try {
    const value = await action();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

const tenantId = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_create_tenant(NULL,'FleetPulse UAE','Pilot Logistics','pilot-logistics','AE','AED','Asia/Dubai','fleetpulse-ae-starter') AS id",
      )
    ).rows[0].id,
);
const orgId = (await db.query("SELECT organisation_id FROM public.tenants WHERE id=$1", [tenantId]))
  .rows[0].organisation_id;
const instanceId = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_create_landlord_instance('fleetpulse-uae','fleetora',$1,'FleetPulse UAE','ae',$2::jsonb,$3::jsonb) AS id",
        [
          orgId,
          JSON.stringify({ primaryColour: "#0f766e" }),
          JSON.stringify({ allowCustomDomains: true }),
        ],
      )
    ).rows[0].id,
);

const binding = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_bind_fleetora_tenant($1,$2,'fleetpulse-uae','fleetpulse-pilot','https://app.fleetpulse.example','Pilot Logistics','pilot-logistics') AS result",
        [instanceId, tenantId],
      )
    ).rows[0].result,
);
assert.equal(binding.migrationMode, "shadow");
assert.equal(binding.variantProductKey, "fleetpulse-uae");
const tenantBranding = await asUser(admin, () =>
  db.query("SELECT brand_name FROM public.tenant_branding WHERE tenant_id=$1", [tenantId]),
);
assert.equal(tenantBranding.rows[0].brand_name, "Pilot Logistics");

const domainId = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_upsert_domain($1,'fleetpulse-uae','fleet.pilot.example',true) AS id",
        [tenantId],
      )
    ).rows[0].id,
);
const domainChallenge = (
  await db.query(
    "SELECT verification_record_name,verification_record_value,verification_status,ssl_status FROM public.tenant_domains WHERE id=$1",
    [domainId],
  )
).rows[0];
assert.equal(
  domainChallenge.verification_record_name,
  "_omniqora-verification.fleet.pilot.example",
);
assert.match(domainChallenge.verification_record_value, /^omniqora-domain=[a-f0-9]{32}$/);
assert.equal(domainChallenge.verification_status, "pending");
assert.equal(domainChallenge.ssl_status, "pending");

const otherTenantId = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_create_tenant(NULL,'Other Fleet','Other Fleet','other-fleet','AE','AED','Asia/Dubai',NULL) AS id",
      )
    ).rows[0].id,
);
await assert.rejects(
  asUser(admin, () =>
    db.query("SELECT public.platform_upsert_domain($1,NULL,'fleet.pilot.example',true)", [
      otherTenantId,
    ]),
  ),
  /already claimed by another tenant/,
);

await asService(() =>
  db.query(
    "SELECT public.service_report_domain_verification($1,'fleet.pilot.example',false,false,$2::jsonb,NULL,'DNS TXT challenge has not propagated yet')",
    [tenantId, JSON.stringify([])],
  ),
);
await asService(() =>
  db.query(
    "SELECT public.service_report_domain_verification($1,'fleet.pilot.example',true,true,$2::jsonb,200,NULL)",
    [tenantId, JSON.stringify([domainChallenge.verification_record_value])],
  ),
);
const verifiedDomain = (
  await db.query(
    "SELECT verification_status,ssl_status,verification_attempts,verified_at,ssl_activated_at,failure_reason FROM public.tenant_domains WHERE id=$1",
    [domainId],
  )
).rows[0];
assert.equal(verifiedDomain.verification_status, "verified");
assert.equal(verifiedDomain.ssl_status, "active");
assert.equal(verifiedDomain.verification_attempts, 2);
assert(verifiedDomain.verified_at);
assert(verifiedDomain.ssl_activated_at);
assert.equal(verifiedDomain.failure_reason, null);
const domainAttempts = await db.query(
  "SELECT dns_verified,ssl_active FROM public.tenant_domain_verification_attempts WHERE domain_id=$1 ORDER BY id",
  [domainId],
);
assert.deepEqual(domainAttempts.rows, [
  { dns_verified: false, ssl_active: false },
  { dns_verified: true, ssl_active: true },
]);
const verificationJob = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_request_domain_verification($1,'fleet.pilot.example') AS id",
        [tenantId],
      )
    ).rows[0].id,
);
assert(verificationJob);

await asService(async () => {
  await db.query(
    "UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='fleetpulse-uae'",
    [tenantId],
  );
  await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1", [
    tenantId,
  ]);
  await db.query(
    "UPDATE public.product_connections SET status='connected',last_verified_at=now() WHERE tenant_id=$1 AND product_key='fleetpulse-uae'",
    [tenantId],
  );
  for (let index = 1; index <= 9; index += 1) {
    await db.query(
      `INSERT INTO public.routing_shadow_evaluations(
      tenant_id,product_key,source_route_id,candidate_engine,source_distance_km,candidate_distance_km,stop_count,sequence_match_ratio,passed,evidence
    ) VALUES($1,'fleetpulse-uae',$2,'omniqora.native-routing.v1',10,9.8,5,0.95,true,$3::jsonb)`,
      [tenantId, `route-${index}`, JSON.stringify({ fixture: true })],
    );
  }
});

const readiness = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.get_fleetora_migration_readiness($1,'fleetpulse-uae') AS result",
        [tenantId],
      )
    ).rows[0].result,
);
assert.equal(readiness.ready, true);
assert.equal(readiness.landlordBound, true);
assert.equal(readiness.migrationMode, "shadow");
assert.equal(readiness.shadowPassed, 9);
assert.equal(readiness.requiredShadowPasses, 10);
assert.equal(readiness.readCutoverEligible, false);
assert.equal(readiness.writeCutoverEligible, false);
const operatorState = await asUser(
  admin,
  async () =>
    (
      await db.query("SELECT public.get_fleetora_operator_state($1,'fleetpulse-uae') AS result", [
        tenantId,
      ])
    ).rows[0].result,
);
assert.equal(operatorState.landlords.length, 1);
assert.equal(operatorState.landlords[0].status, "active");
assert.equal(operatorState.binding.tenant_id, tenantId);
assert.equal(operatorState.readiness.requiredShadowPasses, 10);
const featureAuthority = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_set_fleetora_feature_authority($1,'fleetpulse-uae',$2,true) AS result",
        [tenantId, ["advanced_reporting", "white_label"]],
      )
    ).rows[0].result,
);
assert.equal(featureAuthority.authoritative, true);
assert.deepEqual(featureAuthority.entitlements, ["advanced_reporting", "white_label"]);
await assert.rejects(
  asUser(admin, () =>
    db.query("SELECT public.platform_set_fleetora_feature_authority($1,'fleetpulse-uae',$2,true)", [
      tenantId,
      ["unknown_feature"],
    ]),
  ),
  /Unknown FleetPulse feature entitlement/,
);
const serviceReadiness = await asService(
  async () =>
    (
      await db.query(
        "SELECT public.get_fleetora_migration_readiness($1,'fleetpulse-uae') AS result",
        [tenantId],
      )
    ).rows[0].result,
);
assert.equal(serviceReadiness.ready, true);

const readApproval = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_request_fleetora_cutover($1,'fleetpulse-uae','read','Pilot routing evidence accepted for read authority') AS id",
        [tenantId],
      )
    ).rows[0].id,
);
await asUser(admin, () =>
  db.query("SELECT public.platform_review_fleetora_cutover($1,'approved','Evidence reviewed')", [
    readApproval,
  ]),
);
const ninePassReadiness = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.get_fleetora_migration_readiness($1,'fleetpulse-uae') AS result",
        [tenantId],
      )
    ).rows[0].result,
);
assert.equal(ninePassReadiness.readApprovalGranted, true);
assert.equal(ninePassReadiness.readCutoverEligible, false);
await asService(() =>
  db.query(
    `INSERT INTO public.routing_shadow_evaluations(
      tenant_id,product_key,source_route_id,candidate_engine,source_distance_km,candidate_distance_km,stop_count,sequence_match_ratio,passed,evidence
    ) VALUES($1,'fleetpulse-uae','route-10','omniqora.native-routing.v1',10,9.8,5,0.95,true,$2::jsonb)`,
    [tenantId, JSON.stringify({ fixture: true })],
  ),
);
const readCutover = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_set_fleetora_migration_mode($1,'fleetpulse-uae','read') AS result",
        [tenantId],
      )
    ).rows[0].result,
);
assert.equal(readCutover.migrationMode, "read");

const writeApproval = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_request_fleetora_cutover($1,'fleetpulse-uae','write','Pilot tenant accepted for controlled write authority') AS id",
        [tenantId],
      )
    ).rows[0].id,
);
await asUser(admin, () =>
  db.query(
    "SELECT public.platform_review_fleetora_cutover($1,'approved','Pilot owner approved controlled cutover')",
    [writeApproval],
  ),
);
const writeCutover = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.platform_set_fleetora_migration_mode($1,'fleetpulse-uae','write') AS result",
        [tenantId],
      )
    ).rows[0].result,
);
assert.equal(writeCutover.migrationMode, "write");
const consumedApprovals = await db.query(
  "SELECT count(*)::integer AS count FROM public.fleetora_cutover_approvals WHERE tenant_id=$1 AND status='consumed'",
  [tenantId],
);
assert.equal(consumedApprovals.rows[0].count, 2);

const agent = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "INSERT INTO public.dispatch_agents(tenant_id,product_key,name,status,skills,capacity) VALUES($1,'fleetpulse-uae','Agent One','available',ARRAY['delivery'],20) RETURNING id",
        [tenantId],
      )
    ).rows[0].id,
);
await asUser(admin, () =>
  db.query(
    "INSERT INTO public.dispatch_agent_positions(tenant_id,product_key,agent_id,latitude,longitude,observed_at) VALUES($1,'fleetpulse-uae',$2,25.2048,55.2708,now())",
    [tenantId, agent],
  ),
);
const job = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.dispatch_create_job($1,'fleetpulse-uae',NULL,'delivery','normal','fleetpulse-job-1',$2::jsonb,$3::jsonb) AS id",
        [
          tenantId,
          JSON.stringify({ source: "fleetpulse" }),
          JSON.stringify([
            { kind: "pickup", lat: 25.205, lng: 55.271 },
            { kind: "dropoff", lat: 25.215, lng: 55.281 },
          ]),
        ],
      )
    ).rows[0].id,
);
const wrongProductAgent = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "INSERT INTO public.dispatch_agents(tenant_id,product_key,name,status,skills,capacity) VALUES($1,'fleetora','Wrong Product Agent','available',ARRAY['delivery'],20) RETURNING id",
        [tenantId],
      )
    ).rows[0].id,
);
await assert.rejects(
  asUser(admin, () =>
    db.query("SELECT public.dispatch_assign_job($1,$2,NULL)", [job, wrongProductAgent]),
  ),
  /outside the job product scope/,
);
const assigned = await asUser(
  admin,
  async () =>
    (await db.query("SELECT public.dispatch_auto_assign_job($1) AS id", [job])).rows[0].id,
);
assert.equal(assigned, agent);
await assert.rejects(
  asUser(admin, () => db.query("SELECT public.dispatch_update_status($1,'completed')", [job])),
  /Invalid dispatch transition/,
);
await assert.rejects(
  asService(() =>
    db.query("SELECT public.service_dispatch_update_status($1,'fleetpulse-uae',$2,$3,'accepted')", [
      tenantId,
      wrongProductAgent,
      job,
    ]),
  ),
  /Assigned agent job scope refused/,
);
await asService(() =>
  db.query("SELECT public.service_dispatch_update_status($1,'fleetpulse-uae',$2,$3,'accepted')", [
    tenantId,
    agent,
    job,
  ]),
);
const walletEntry = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.fleet_post_wallet_entry($1,$2,'AED','earning',1500,'job:fleetpulse-job-1','dispatch_job',$3,'{}') AS id",
        [tenantId, agent, job],
      )
    ).rows[0].id,
);
assert(walletEntry);
await asUser(admin, () =>
  db.query(
    "INSERT INTO public.fleet_shifts(tenant_id,product_key,agent_id,starts_at,ends_at,status) VALUES($1,'fleetpulse-uae',$2,now(),now()+interval '8 hours','active')",
    [tenantId, agent],
  ),
);
const reusableTables = await db.query(
  "SELECT count(*)::integer AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('fleet_shifts','fleet_attendance_events','fleet_maintenance_work_orders','fleet_behaviour_events','fleet_wallet_accounts','fleet_wallet_entries','dispatch_sla_policies','dispatch_exceptions','dispatch_rate_cards','carrier_connections','operations_recommendations')",
);
assert.equal(reusableTables.rows[0].count, 11);
const recommendation = await asService(
  async () =>
    (
      await db.query(
        "INSERT INTO public.operations_recommendations(tenant_id,product_key,recommendation_type,subject_type,subject_id,source_kind,confidence,evidence,recommendation) VALUES($1,'fleetpulse-uae','route_efficiency','dispatch_job',$2,'deterministic',0.88,'[]',$3::jsonb) RETURNING id",
        [tenantId, job, JSON.stringify({ action: "review_route" })],
      )
    ).rows[0].id,
);
await asUser(admin, () =>
  db.query("SELECT public.review_operations_recommendation($1,'approved','Pilot review')", [
    recommendation,
  ]),
);
const reviewed = await db.query(
  "SELECT status,reviewed_by FROM public.operations_recommendations WHERE id=$1",
  [recommendation],
);
assert.deepEqual(reviewed.rows[0], { status: "approved", reviewed_by: admin });
await assert.rejects(
  asUser(admin, () =>
    db.query("UPDATE public.operations_recommendations SET status='applied' WHERE id=$1", [
      recommendation,
    ]),
  ),
  /permission denied/,
);

const vehicle = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "INSERT INTO public.dispatch_vehicles(tenant_id,product_key,registration,vehicle_type,status) VALUES($1,'fleetpulse-uae','FP01UAE','van','maintenance') RETURNING id",
        [tenantId],
      )
    ).rows[0].id,
);
await asUser(admin, () =>
  db.query(
    "INSERT INTO public.fleet_maintenance_work_orders(tenant_id,vehicle_id,work_type,priority,status,due_at) VALUES($1,$2,'service','high','open',now()-interval '1 day')",
    [tenantId, vehicle],
  ),
);
const generated = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.generate_operations_recommendations($1,'fleetpulse-uae') AS count",
        [tenantId],
      )
    ).rows[0].count,
);
assert.equal(generated, 1);
const generatedAgain = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.generate_operations_recommendations($1,'fleetpulse-uae') AS count",
        [tenantId],
      )
    ).rows[0].count,
);
assert.equal(generatedAgain, 0);
const maintenanceRecommendation = await db.query(
  "SELECT status,recommendation->>'requiresHumanApproval' AS human_approval FROM public.operations_recommendations WHERE tenant_id=$1 AND recommendation_type='maintenance_due'",
  [tenantId],
);
assert.deepEqual(maintenanceRecommendation.rows[0], { status: "review", human_approval: "true" });

const routeProposal = await asService(
  async () =>
    (
      await db.query(
        `INSERT INTO public.routing_plan_proposals(
    tenant_id,product_key,external_route_id,input_fingerprint,plan_hash,engine,plan,source_service
  ) VALUES($1,'fleetpulse-uae','fleet-route-1',$2,$3,'omniqora.native-routing.v2',$4::jsonb,'test.runtime') RETURNING id`,
        [
          tenantId,
          "a".repeat(64),
          "b".repeat(64),
          JSON.stringify({
            engine: "omniqora.native-routing.v2",
            routes: [
              {
                resourceId: "driver-1",
                orderedStopIds: ["order-1"],
                legsKm: [1.2],
                totalDistanceKm: 1.2,
              },
            ],
            unassigned: [],
            assignedStopCount: 1,
            totalStopCount: 1,
            totalDistanceKm: 1.2,
          }),
        ],
      )
    ).rows[0].id,
);
const proposalReview = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.review_routing_plan_proposal($1,'approved','Dispatcher reviewed constrained route') AS result",
        [routeProposal],
      )
    ).rows[0].result,
);
assert.equal(proposalReview.status, "approved");
assert.equal(proposalReview.planHash, "b".repeat(64));

await assert.rejects(
  asService(() =>
    db.query(
      `INSERT INTO public.routing_plan_proposals(
      tenant_id,product_key,external_route_id,input_fingerprint,plan_hash,engine,plan,source_service
    ) SELECT tenant_id,product_key,external_route_id,$2,$3,engine,plan,'test.concurrent'
      FROM public.routing_plan_proposals WHERE id=$1`,
      [routeProposal, "e".repeat(64), "f".repeat(64)],
    ),
  ),
  /routing_plan_proposals_one_active_route_idx/,
);
await asService(() =>
  db.query("UPDATE public.routing_plan_proposals SET status='superseded' WHERE id=$1", [
    routeProposal,
  ]),
);
const replacementProposal = await asService(
  async () =>
    (
      await db.query(
        `INSERT INTO public.routing_plan_proposals(
    tenant_id,product_key,external_route_id,input_fingerprint,plan_hash,engine,plan,source_service
  ) SELECT tenant_id,product_key,external_route_id,$2,$3,engine,plan,'test.replacement'
    FROM public.routing_plan_proposals WHERE id=$1 RETURNING id`,
        [routeProposal, "e".repeat(64), "f".repeat(64)],
      )
    ).rows[0].id,
);
assert(replacementProposal);
await asUser(admin, () =>
  db.query(
    "SELECT public.review_routing_plan_proposal($1,'approved','Dispatcher approved replacement route')",
    [replacementProposal],
  ),
);
const appliedAt = new Date().toISOString();
const firstProjection = await asService(
  async () =>
    (
      await db.query(
        "SELECT public.project_routing_proposal_applied($1,'fleetpulse-uae',$2,'fleet-route-1',$3,$4) AS result",
        [tenantId, replacementProposal, "f".repeat(64), appliedAt],
      )
    ).rows[0].result,
);
assert.equal(firstProjection.idempotent, false);
const replayedProjection = await asService(
  async () =>
    (
      await db.query(
        "SELECT public.project_routing_proposal_applied($1,'fleetpulse-uae',$2,'fleet-route-1',$3,$4) AS result",
        [tenantId, replacementProposal, "f".repeat(64), appliedAt],
      )
    ).rows[0].result,
);
assert.equal(replayedProjection.idempotent, true);

const slaPolicy = await asUser(
  admin,
  async () =>
    (
      await db.query(
        `INSERT INTO public.dispatch_sla_policies(
    tenant_id,product_key,name,job_type,accept_within_seconds,arrive_within_seconds,complete_within_seconds
  ) VALUES($1,'fleetpulse-uae','Pilot delivery SLA','delivery',60,120,180) RETURNING id`,
        [tenantId],
      )
    ).rows[0].id,
);
await asService(() =>
  db.query(
    "SELECT public.project_external_dispatch_status($1,'fleetpulse-uae','external-job-1','delivery','urgent','assigned',now()-interval '2 hours',now()-interval '90 minutes',now()-interval '1 hour')",
    [tenantId],
  ),
);
const slaExceptions = await db.query(
  "SELECT id,exception_type,severity,status,detail->>'requiresHumanApproval' AS human_approval FROM public.dispatch_exceptions WHERE tenant_id=$1 AND external_job_id='external-job-1' ORDER BY exception_type",
  [tenantId],
);
assert.equal(slaExceptions.rows.length, 3);
assert(
  slaExceptions.rows.every((row) => row.severity === "critical" && row.human_approval === "true"),
);
const exceptionReview = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.review_dispatch_exception($1,'acknowledged','Dispatcher investigating projected SLA breach') AS result",
        [slaExceptions.rows[0].id],
      )
    ).rows[0].result,
);
assert.equal(exceptionReview.status, "acknowledged");
const slaRecommendations = await asUser(
  admin,
  async () =>
    (
      await db.query(
        "SELECT public.generate_operations_recommendations($1,'fleetpulse-uae') AS count",
        [tenantId],
      )
    ).rows[0].count,
);
assert.equal(slaRecommendations, 3);

const aiRecommendation = await asService(
  async () =>
    (
      await db.query(
        `INSERT INTO public.operations_recommendations(
    tenant_id,product_key,recommendation_type,subject_type,subject_id,source_kind,source_ref,
    confidence,evidence,recommendation,proposal_hash,model_key,policy_key,prompt_template_version,
    requested_by_service,expires_at
  ) VALUES($1,'fleetpulse-uae','sla_risk','tenant_operations',$2,'ai_assisted',$3,0.91,$4::jsonb,$5::jsonb,
    $6,'provider:model','fleet-ops-safe-v1','v1','fixture.service',now()+interval '1 hour') RETURNING id`,
        [
          tenantId,
          tenantId,
          slaPolicy,
          JSON.stringify([
            {
              kind: "sla_exception",
              id: slaExceptions.rows[0].id,
              observedAt: new Date().toISOString(),
            },
          ]),
          JSON.stringify({
            action: "review_dispatch_exception",
            reasonCodes: ["acceptance_delay"],
            metrics: { breachCount: 3 },
            requiresHumanApproval: true,
            automaticApplicationAllowed: false,
          }),
          "9".repeat(64),
        ],
      )
    ).rows[0].id,
);
await asUser(admin, () =>
  db.query(
    "SELECT public.review_operations_recommendation($1,'approved','Human reviewed structured SLA evidence')",
    [aiRecommendation],
  ),
);
const intelligenceAudit = await db.query(
  "SELECT event_type,payload_hash FROM public.operations_recommendation_events WHERE recommendation_id=$1 ORDER BY created_at,event_type",
  [aiRecommendation],
);
assert.deepEqual(intelligenceAudit.rows.map((row) => row.event_type).sort(), [
  "approved",
  "proposed",
]);
assert(intelligenceAudit.rows.every((row) => row.payload_hash === "9".repeat(64)));

const incompleteProposal = await asService(
  async () =>
    (
      await db.query(
        `INSERT INTO public.routing_plan_proposals(
    tenant_id,product_key,external_route_id,input_fingerprint,plan_hash,engine,plan,source_service
  ) VALUES($1,'fleetpulse-uae','fleet-route-2',$2,$3,'omniqora.native-routing.v2',$4::jsonb,'test.runtime') RETURNING id`,
        [
          tenantId,
          "c".repeat(64),
          "d".repeat(64),
          JSON.stringify({
            engine: "omniqora.native-routing.v2",
            routes: [],
            unassigned: [{ stopId: "order-2", reason: "capacity" }],
          }),
        ],
      )
    ).rows[0].id,
);
await assert.rejects(
  asUser(admin, () =>
    db.query("SELECT public.review_routing_plan_proposal($1,'approved','Should remain blocked')", [
      incompleteProposal,
    ]),
  ),
  /Only complete routing proposals can be approved/,
);
await asService(async () => {
  await db.query(
    "UPDATE public.routing_plan_proposals SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [incompleteProposal],
  );
  await db.query(
    "UPDATE public.operations_recommendations SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [aiRecommendation],
  );
});
const maintenance = await asService(
  async () =>
    (
      await db.query("SELECT public.run_fleetora_maintenance($1,'fleetpulse-uae') AS result", [
        tenantId,
      ])
    ).rows[0].result,
);
assert.equal(maintenance.expiredRouteProposals, 1);
assert.equal(maintenance.expiredRecommendations, 1);
assert(maintenance.evaluatedSlaBreaches >= 3);

const projectionTables = await db.query(
  "SELECT count(*)::integer AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('routing_plan_proposals','external_pod_receipts','external_dispatch_jobs','operations_recommendation_events')",
);
assert.equal(projectionTables.rows[0].count, 4);

const products = await db.query(
  "SELECT product_key,product_role,parent_product_key FROM public.product_catalogue WHERE product_key IN ('fleetora','fleetpulse-uae') ORDER BY product_key",
);
assert.deepEqual(products.rows, [
  { product_key: "fleetora", product_role: "landlord", parent_product_key: null },
  { product_key: "fleetpulse-uae", product_role: "experience", parent_product_key: "fleetora" },
]);
const sharedEngines = await db.query(
  "SELECT service_key,implementation_status FROM public.service_catalogue WHERE service_key IN ('omniqora.geo','omniqora.dispatch','omniqora.fleet','omniqora.tracking') ORDER BY service_key",
);
assert.equal(sharedEngines.rows.length, 4);
assert(sharedEngines.rows.every((row) => row.implementation_status === "built_main"));
const hidden = await asUser(stranger, () =>
  db.query("SELECT * FROM public.landlord_instance_tenants WHERE tenant_id=$1", [tenantId]),
);
assert.equal(hidden.rows.length, 0);
await assert.rejects(
  asUser(stranger, () =>
    db.query("SELECT public.get_fleetora_operator_state($1,'fleetpulse-uae')", [tenantId]),
  ),
  /Tenant access denied/,
);

await db.close();
console.log(
  "Fleetora landlord, FleetPulse UAE tenant and native Omniqora routing shadow gates verified",
);
