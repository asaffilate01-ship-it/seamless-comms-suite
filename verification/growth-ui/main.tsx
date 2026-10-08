import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { GrowthSetupView } from "../../src/modules/growth/GrowthSetupView";
import type { GrowthSetup } from "../../src/modules/growth/setup.contract";
import "../../src/styles.css";

const fixture: GrowthSetup = {
  tenant: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sample workspace",
    status: "active",
  },
  product: {
    key: "omniqora",
    name: "Omniqora",
    status: null,
    deploymentMode: "hosted",
    implementationStatus: "built_main",
  },
  access: {
    allowed: false,
    canWrite: false,
    canReview: false,
    canHandoff: false,
    role: "owner",
    reason: "Product activation is required.",
  },
  permissions: { canRequest: true, canConfigure: true, canDecide: false, reviewAvailable: true },
  services: [
    {
      key: "omniqora.ai",
      name: "Omniqora AI",
      status: null,
      active: false,
      validFrom: null,
      validUntil: null,
      implementationStatus: "built_main",
      provisionable: true,
    },
    {
      key: "omniqora.campaigns",
      name: "Campaigns",
      status: null,
      active: false,
      validFrom: null,
      validUntil: null,
      implementationStatus: "built_main",
      provisionable: true,
    },
    {
      key: "omniqora.creative",
      name: "Creative Studio",
      status: null,
      active: false,
      validFrom: null,
      validUntil: null,
      implementationStatus: "built_main",
      provisionable: true,
    },
    {
      key: "omniqora.documents",
      name: "Documents",
      status: "active",
      active: true,
      validFrom: "2026-10-01T00:00:00Z",
      validUntil: null,
      implementationStatus: "built_main",
      provisionable: true,
    },
    {
      key: "omniqora.identity",
      name: "Identity",
      status: "active",
      active: true,
      validFrom: "2026-10-01T00:00:00Z",
      validUntil: null,
      implementationStatus: "built_main",
      provisionable: true,
    },
  ],
  connection: { verified: false, lastVerifiedAt: null },
  request: null,
  history: [],
  blockers: [],
  providers: [],
};

function Fixture() {
  const [includeCreative, setIncludeCreative] = useState(true);
  const [notice, setNotice] = useState("");
  const [scenario, setScenario] = useState("owner");
  const setup = structuredClone(fixture);
  if (!includeCreative)
    setup.services = setup.services.filter(
      (service) => !["omniqora.creative", "omniqora.documents"].includes(service.key),
    );
  if (scenario === "viewer") {
    setup.access.role = "viewer";
    setup.permissions.canRequest = false;
    setup.permissions.canConfigure = false;
  }
  if (scenario === "no-admin") setup.permissions.reviewAvailable = false;
  if (scenario === "pending") {
    setup.access.role = "platform_admin";
    setup.permissions.canDecide = true;
    setup.request = {
      id: "22222222-2222-4222-8222-222222222222",
      tenantId: setup.tenant.id,
      productKey: "omniqora",
      requestKey: "33333333-3333-4333-8333-333333333333",
      includeCreative: true,
      status: "requested",
      note: "Prepare reviewed campaigns and creative briefs for this workspace.",
      decisionNote: null,
      requestedBy: "44444444-4444-4444-8444-444444444444",
      decidedBy: null,
      decidedAt: null,
      createdAt: "2026-10-08T18:45:00Z",
      updatedAt: "2026-10-08T18:45:00Z",
      revision: 1,
      receipt: null,
    };
  }
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Omniqora Growth
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Workspace setup</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            UI verification fixture · sample data · no network actions
          </p>
        </div>
        <label className="text-xs">
          Scenario{" "}
          <select
            className="ml-2 rounded border bg-background p-2"
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value);
              setNotice("");
            }}
          >
            <option value="owner">Workspace owner</option>
            <option value="viewer">Read-only member</option>
            <option value="pending">Administrator review</option>
            <option value="no-admin">No platform reviewer</option>
          </select>
        </label>
      </div>
      {notice && (
        <p role="status" className="rounded border bg-card p-3 text-sm">
          {notice}
        </p>
      )}
      <GrowthSetupView
        key={scenario}
        setup={setup}
        initiallyOpen
        includeCreative={includeCreative}
        onIncludeCreativeChange={setIncludeCreative}
        pending={null}
        error={null}
        refreshing={false}
        onRefresh={() => setNotice("Fixture refresh selected; no live request was sent.")}
        onRequest={() => setNotice("Fixture activation action selected; no live request was sent.")}
        onDecision={(_, decision) =>
          setNotice(`Fixture ${decision} action selected; no live access changed.`)
        }
        onSaveWriter={() => setNotice("Fixture writer action selected; no credentials were saved.")}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
