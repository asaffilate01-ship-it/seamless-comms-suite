import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// These tests execute the real contract, provider, repository and runtime modules.
// HTTP and Supabase boundaries use controlled fixtures; no credentials, provider
// charges, external publication or production writes are involved.
const require = createRequire(import.meta.url),
  ts = require("typescript");
const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const compile = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString("base64");
const replaceSpecifier = (source, specifier, replacement) =>
  source
    .replaceAll(JSON.stringify(specifier), JSON.stringify(replacement))
    .replaceAll("'" + specifier + "'", JSON.stringify(replacement));
const zodUrl = pathToFileURL(require.resolve("zod")).href;
const contractUrl = compile(
  replaceSpecifier(await read("../src/modules/growth/studio.contract.ts"), "zod", zodUrl),
);
const providerUrl = compile(
  replaceSpecifier(
    replaceSpecifier(await read("../src/modules/growth/studio.providers.server.ts"), "zod", zodUrl),
    "./studio.contract",
    contractUrl,
  ),
);
const repositoryUrl = compile(await read("../src/modules/growth/studio.repository.server.ts"));
const accessUrl = compile(await read("../src/modules/platform/access.ts"));
let runtimeSource = await read("../src/modules/growth/studio.runtime.server.ts");
for (const [specifier, url] of [
  ["../platform/access", accessUrl],
  ["./studio.repository.server", repositoryUrl],
  ["./studio.providers.server", providerUrl],
  ["./studio.contract", contractUrl],
])
  runtimeSource = replaceSpecifier(runtimeSource, specifier, url);
runtimeSource = runtimeSource.replace(
  /import\(\s*["']@\/integrations\/supabase\/client\.server["']\s*\)/g,
  "({supabaseAdmin:globalThis.__growthRuntimeAdmin})",
);
const contracts = await import(contractUrl),
  providers = await import(providerUrl),
  runtime = await import(compile(runtimeSource));
let passed = 0;
const check = async (name, fn) => {
  await fn();
  console.log(`PASS ${++passed}: ${name}`);
};
const copy = (value) => structuredClone(value);
const scope = { tenantId: "a1111111-1111-4111-8111-111111111111", productKey: "omniqora" };
const ownerId = "a2222222-2222-4222-8222-222222222222";
const brandId = "a3333333-3333-4333-8333-333333333333";
const evidenceId = "a4444444-4444-4444-8444-444444444444";
const campaignId = "a5555555-5555-4555-8555-555555555555";
const bindingIds = {
  "ai.openai": "a6666666-6666-4666-8666-666666666666",
  "ai.anthropic": "a7777777-7777-4777-8777-777777777777",
  "ai.gemini": "a8888888-8888-4888-8888-888888888888",
  "ai.jev": "a9999999-9999-4999-8999-999999999999",
};
const fixtureSecret = (key) => `controlled-${key}-fixture-key`;
const env = { OMNIQORA_GROWTH_ENVIRONMENT: "production" };
for (const key of Object.keys(bindingIds))
  env[providers.growthCredentialName(scope, key)] = fixtureSecret(key);
function binding(providerKey = "ai.openai", changes = {}) {
  return {
    id: bindingIds[providerKey],
    tenant_id: scope.tenantId,
    product_key: scope.productKey,
    provider_key: providerKey,
    environment: "production",
    status: "configured",
    brand_id: null,
    location_id: null,
    secret_refs: { api_key: "env:" + providers.growthCredentialName(scope, providerKey) },
    config: {
      growth_enabled: true,
      model: providerKey === "ai.jev" ? "jev-fixture" : "writer-fixture",
      max_output_tokens: 2048,
    },
    ...changes,
  };
}
function snapshot() {
  const base = {
    ...scope,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    brand: {
      ...base,
      id: brandId,
      name: "Controlled brand",
      voice: "Helpful and factual",
      offer: "A cotton hoodie",
      rules: ["Use the supplied evidence"],
      audience: "Local customers",
      locale: "en",
      disclosure: "",
    },
    campaign: {
      ...base,
      id: campaignId,
      brandId,
      title: "Introduce the hoodie",
      objective: "Explain the verified product",
      channel: "social",
      locale: "en",
      evidenceIds: [evidenceId],
    },
    evidence: [
      {
        ...base,
        id: evidenceId,
        brandId,
        title: "Product fact",
        content: "The item is a cotton hoodie.",
        sourceUrl: "https://merchant.example.invalid/product/one",
        kind: "product_data",
        validUntil: "2099-01-01T00:00:00.000Z",
      },
    ],
    writerBindingId: bindingIds["ai.openai"],
    classifierBindingId: null,
  };
}
function output(changes = {}) {
  return {
    angle: "A factual product introduction",
    rationale: "Use the supplied catalogue description",
    variants: [
      {
        key: "a",
        headline: "Meet the cotton hoodie",
        body: "Explore the cotton hoodie from Controlled brand.",
        callToAction: "View the product",
        hashtags: ["#Cotton"],
        evidenceIds: [evidenceId],
        disclosure: "",
      },
    ],
    creativeBrief: {
      direction: "Use the approved product photograph and readable typography.",
      assetTypes: ["copy", "image"],
    },
    warnings: [],
    ...changes,
  };
}
function writerReply(key, draft = output(), changes = {}) {
  const text = typeof draft === "string" ? draft : JSON.stringify(draft);
  if (key === "ai.openai")
    return {
      status: "completed",
      model: "writer-fixture-resolved",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage: { input_tokens: 120, output_tokens: 60 },
      ...changes,
    };
  if (key === "ai.anthropic")
    return {
      stop_reason: "end_turn",
      model: "writer-fixture-resolved",
      content: [
        { type: "thinking", thinking: "internal reasoning is excluded" },
        { type: "text", text },
      ],
      usage: { input_tokens: 110, output_tokens: 55 },
      ...changes,
    };
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ thought: true, text: "Excluded private thought" }, { text }] },
      },
    ],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    ...changes,
  };
}
const classifierReply = (changes = {}) => ({
  answers: {
    brand_fit: { choice: "matches", confidence: 0.92 },
    claim_support: { choice: "supported", confidence: 0.88 },
  },
  model: "jev-fixture-resolved",
  usage: { input_tokens: 100, output_tokens: 5 },
  ...changes,
});
const response = (value, init = {}) =>
  new Response(typeof value === "string" ? value : JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "controlled-request",
      ...init.headers,
    },
    ...init,
  });
const transport = (respond) => {
  const calls = [];
  const fetcher = async (url, init) => {
    const call = { url, init, body: JSON.parse(init.body) };
    calls.push(call);
    return respond(call, calls.length);
  };
  return { fetcher, calls };
};

// A minimal query builder models only operations used by the real modules. Rows
// are cloned like network responses so a later binding mutation cannot silently
// mutate an earlier authorization snapshot in the test itself.
function fixture(options = {}) {
  const state = {
    rows: {
      tenants: [{ id: scope.tenantId, status: "active" }],
      tenant_members: [
        { tenant_id: scope.tenantId, user_id: ownerId, role: options.role ?? "owner" },
      ],
      tenant_products: [
        { tenant_id: scope.tenantId, product_key: scope.productKey, status: "active" },
      ],
      tenant_services: ["omniqora.campaigns", "omniqora.creative"].map((key) => ({
        tenant_id: scope.tenantId,
        service_key: key,
        status: "active",
        valid_from: "2020-01-01T00:00:00Z",
        valid_until: null,
      })),
      provider_bindings: Object.keys(bindingIds).map((key) => binding(key)),
    },
    snapshot: snapshot(),
    records: new Map(),
    claims: new Map(),
    starts: [],
    finishes: [],
    queries: [],
    onStart: null,
    beforeFinish: null,
    queryError: null,
    queryHook: null,
  };
  function db(service = false) {
    return {
      from(table) {
        const filters = [];
        let single = false;
        const query = {
          select() {
            return this;
          },
          eq(key, value) {
            filters.push((row) => row[key] === value);
            return this;
          },
          in(key, values) {
            filters.push((row) => values.includes(row[key]));
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          maybeSingle() {
            single = true;
            return execute();
          },
          then(resolve, reject) {
            return execute().then(resolve, reject);
          },
        };
        async function execute() {
          state.queries.push(table);
          if (state.queryHook) await state.queryHook(table);
          if (state.queryError === table)
            return { data: null, error: { message: "private-database-diagnostic" } };
          let rows =
            table === "growth_studio_runs"
              ? [...state.records.values()].map((run) => ({
                  id: run.id,
                  tenant_id: run.tenantId,
                  product_key: run.productKey,
                  request_key: run.requestKey,
                  campaign_id: run.campaignId,
                  writer_binding_id: run.inputSnapshot.writerBindingId,
                  classifier_binding_id: run.inputSnapshot.classifierBindingId,
                }))
              : state.rows[table];
          assert(rows, `Unexpected table ${table}`);
          rows = rows.filter((row) => filters.every((filter) => filter(row)));
          return { data: copy(single ? (rows[0] ?? null) : rows), error: null };
        }
        return query;
      },
      async rpc(name, args) {
        if (name === "is_platform_admin") return { data: false, error: null };
        if (name === "growth_studio_get_run") {
          const run = [...state.records.values()].find(
            (item) =>
              item.id === args._run &&
              item.tenantId === args._tenant &&
              item.productKey === args._product,
          );
          return { data: copy(run), error: run ? null : { message: "Growth run not found" } };
        }
        if (name === "growth_studio_start_run") {
          assert.equal(service, false, "Start must use the authenticated client");
          state.starts.push(copy(args));
          const key = `${args._tenant}:${args._product}:${args._request_key}`;
          const existing = state.records.get(key);
          if (existing) {
            if (
              existing.campaignId !== args._campaign ||
              existing.providerKey !== args._provider ||
              existing.model !== args._model
            )
              return {
                data: null,
                error: { message: "Request key already belongs to another generation request" },
              };
            return { data: { run: copy(existing), created: false, claimToken: null }, error: null };
          }
          const run = {
            ...scope,
            id: randomUUID(),
            brandId,
            campaignId: args._campaign,
            requestKey: args._request_key,
            providerKey: args._provider,
            model: args._model,
            status: "running",
            reviewStatus: "pending",
            revision: 1,
            result: null,
            error: null,
            note: null,
            reviewedAt: null,
            finishedAt: null,
            marketingCampaignId: null,
            creativeBriefId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            inputSnapshot: {
              ...copy(state.snapshot),
              writerBindingId: args._writer_binding,
              classifierBindingId: args._classifier_binding,
            },
          };
          const token = randomUUID();
          state.records.set(key, run);
          state.claims.set(run.id, token);
          if (state.onStart) await state.onStart(run);
          return { data: { run: copy(run), created: true, claimToken: token }, error: null };
        }
        if (name === "growth_studio_finish_run") {
          assert.equal(service, true, "Completion must use the service client");
          state.finishes.push(copy(args));
          if (state.beforeFinish) await state.beforeFinish(args, state.finishes.length);
          assert.equal(args._claim_token, state.claims.get(args._run));
          const run = [...state.records.values()].find((run) => run.id === args._run);
          assert(run);
          assert.equal(run.tenantId, args._tenant);
          assert.equal(run.productKey, args._product);
          if (run.status === "running")
            Object.assign(run, {
              status: args._status,
              result: copy(args._result),
              error: args._error,
              revision: run.revision + 1,
              finishedAt: new Date().toISOString(),
            });
          return { data: copy(run), error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    };
  }
  state.db = db();
  state.admin = db(true);
  state.context = { supabase: state.db, userId: ownerId };
  state.input = {
    ...scope,
    campaignId,
    requestKey: randomUUID(),
    writerBindingId: bindingIds["ai.openai"],
    classifierBindingId: null,
  };
  return state;
}
async function withRuntime(
  state,
  fetcher,
  fn = () => runtime.runGrowthCampaign(state.context, state.input),
) {
  const previousFetch = globalThis.fetch,
    previousAdmin = globalThis.__growthRuntimeAdmin;
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  globalThis.fetch = fetcher;
  globalThis.__growthRuntimeAdmin = state.admin;
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAdmin === undefined) delete globalThis.__growthRuntimeAdmin;
    else globalThis.__growthRuntimeAdmin = previousAdmin;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const failStatus = (checks, key) => checks.find((check) => check.key === key)?.status;
const noFetch = () => {
  throw new Error("Unexpected network request");
};

await check(
  "input contracts bound products, languages, source expiry and immutable revisions",
  async () => {
    assert(contracts.growthScopeSchema.safeParse(scope).success);
    for (const productKey of ["dishbee", "../../other", "merqano"])
      assert(!contracts.growthScopeSchema.safeParse({ ...scope, productKey }).success);
    for (const locale of ["en", "ur", "es"])
      assert(
        contracts.saveBrandSchema.safeParse({
          ...scope,
          ...snapshot().brand,
          expectedRevision: 1,
          locale,
        }).success,
      );
    assert(
      !contracts.saveBrandSchema.safeParse({
        ...scope,
        ...snapshot().brand,
        id: brandId,
        expectedRevision: undefined,
      }).success,
    );
    const base = {
      ...scope,
      brandId,
      title: "Verified fact",
      content: "The item is cotton.",
      kind: "product_data",
      validUntil: "2099-01-01T00:00:00Z",
    };
    assert(contracts.saveEvidenceSchema.safeParse(base).success);
    for (const value of [
      { ...base, validUntil: null },
      { ...base, validUntil: "2000-01-01T00:00:00Z" },
      { ...base, validUntil: "infinity" },
      { ...base, sourceUrl: "javascript:alert(1)" },
      { ...base, sourceUrl: "https://user:password@merchant.example.invalid/private" },
    ])
      assert(!contracts.saveEvidenceSchema.safeParse(value).success);
    const draft = {
      ...scope,
      brandId,
      title: "Launch",
      objective: "Introduce the product",
      locale: "en",
      channel: "social",
      evidenceIds: [evidenceId, evidenceId],
    };
    assert.deepEqual(contracts.saveCampaignSchema.parse(draft).evidenceIds, [evidenceId]);
    assert(!contracts.saveCampaignSchema.safeParse({ ...draft, evidenceIds: [] }).success);
    assert(!contracts.growthOutputSchema.safeParse(output({ variants: [] })).success);
    assert(!contracts.growthOutputSchema.safeParse({ ...output(), autoPublish: true }).success);
  },
);

await check(
  "provider bindings cannot select arbitrary environment secrets or foreign scopes",
  async () => {
    const good = binding();
    assert.equal(providers.inspectGrowthBinding(good, scope, env).status, "ready");
    assert.equal(
      providers.growthCredentialName(scope, "ai.openai"),
      "OQ_SECRET_GROWTH_A1111111111141118111111111111111_OMNIQORA_OPENAI",
    );
    const otherScope = { ...scope, tenantId: "b1111111-1111-4111-8111-111111111111" };
    const candidates = [
      { ...good, tenant_id: otherScope.tenantId },
      { ...good, product_key: "affivon" },
      { ...good, brand_id: brandId },
      { ...good, location_id: randomUUID() },
      { ...good, environment: "development" },
      { ...good, status: "disabled" },
      { ...good, status: "failed" },
      { ...good, config: { ...good.config, growth_enabled: false } },
      { ...good, config: { ...good.config, model: "https://attacker.example/steal" } },
      { ...good, secret_refs: { api_key: "env:PATH" } },
      {
        ...good,
        secret_refs: { api_key: "env:" + providers.growthCredentialName(otherScope, "ai.openai") },
      },
    ];
    for (const candidate of candidates)
      assert.equal(
        providers.inspectGrowthBinding(candidate, scope, {
          ...env,
          PATH: "not-authorised-as-provider-key",
        }).status,
        "blocked",
      );
    assert.equal(providers.inspectGrowthBinding(good, scope, {}).status, "blocked");
    assert.equal(
      providers.inspectGrowthBinding(good, scope, {
        ...env,
        [providers.growthCredentialName(scope, "ai.openai")]: "secret\nheader",
      }).status,
      "blocked",
    );
    assert.equal(
      providers.inspectGrowthBinding({ ...good, provider_key: "ai.unlisted" }, scope, env),
      null,
    );
    for (const status of ["configured", "active", "degraded"])
      assert.equal(providers.inspectGrowthBinding({ ...good, status }, scope, env).status, "ready");
  },
);

await check(
  "provider selection enforces purpose, exact binding scope and bounded output tokens",
  async () => {
    const state = fixture();
    await assert.rejects(
      () => providers.resolveGrowthProvider(state.db, scope, null, "writer", env),
      /Select a configured writer/,
    );
    await assert.rejects(
      () => providers.resolveGrowthProvider(state.db, scope, randomUUID(), "writer", env),
      /unavailable/,
    );
    await assert.rejects(
      () => providers.resolveGrowthProvider(state.db, scope, bindingIds["ai.jev"], "writer", env),
      /supported writer/,
    );
    await assert.rejects(
      () =>
        providers.resolveGrowthProvider(
          state.db,
          scope,
          bindingIds["ai.openai"],
          "classifier",
          env,
        ),
      /supported classifier/,
    );
    for (const [requested, expected] of [
      [999999, 4096],
      [-2, 512],
      [1500.9, 1500],
      ["unbounded", 3000],
    ]) {
      state.rows.provider_bindings[0].config.max_output_tokens = requested;
      assert.equal(
        (
          await providers.resolveGrowthProvider(
            state.db,
            scope,
            bindingIds["ai.openai"],
            "writer",
            env,
          )
        ).maxOutputTokens,
        expected,
      );
    }
    state.rows.provider_bindings[0].tenant_id = randomUUID();
    await assert.rejects(
      () =>
        providers.resolveGrowthProvider(state.db, scope, bindingIds["ai.openai"], "writer", env),
      /unavailable/,
    );
  },
);

for (const key of ["ai.openai", "ai.anthropic", "ai.gemini"]) {
  await check(
    `${key} sends the expected fixed endpoint and parses only completed structured copy`,
    async () => {
      const state = fixture(),
        selected = await providers.resolveGrowthProvider(
          state.db,
          scope,
          bindingIds[key],
          "writer",
          env,
        );
      const http = transport(() =>
        response(writerReply(key), { headers: { "x-request-id": "r".repeat(230) } }),
      );
      const generated = await providers.writeGrowthContent(
        selected,
        "A JSON writer instruction",
        { subject: "A cotton hoodie" },
        http.fetcher,
      );
      assert.deepEqual(generated.output, output());
      assert.equal(http.calls.length, 1);
      assert.equal(generated.provider.providerKey, key);
      assert.equal(generated.provider.model, "writer-fixture");
      if (key !== "ai.gemini")
        assert.equal(generated.provider.resolvedModel, "writer-fixture-resolved");
      assert.equal(generated.provider.requestId.length, 200);
      assert(generated.provider.usage.inputTokens > 0);
      assert(generated.provider.usage.outputTokens > 0);
      const { url, init, body } = http.calls[0];
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "error");
      assert(init.signal instanceof AbortSignal);
      assert.equal(body.tools, undefined);
      if (key === "ai.openai") {
        assert.equal(url, "https://api.openai.com/v1/responses");
        assert.equal(init.headers.authorization, `Bearer ${fixtureSecret(key)}`);
        assert.equal(body.store, false);
        assert.equal(body.instructions, "A JSON writer instruction");
        assert.equal(body.max_output_tokens, 2048);
        assert.equal(body.text.format.type, "json_object");
        assert.deepEqual(JSON.parse(body.input), { subject: "A cotton hoodie" });
      } else if (key === "ai.anthropic") {
        assert.equal(url, "https://api.anthropic.com/v1/messages");
        assert.equal(init.headers["x-api-key"], fixtureSecret(key));
        assert.equal(init.headers["anthropic-version"], "2023-06-01");
        assert.equal(body.system, "A JSON writer instruction");
        assert.equal(body.max_tokens, 2048);
        assert.equal(body.messages[0].role, "user");
      } else {
        assert.equal(
          url,
          "https://generativelanguage.googleapis.com/v1beta/models/writer-fixture:generateContent",
        );
        assert.equal(init.headers["x-goog-api-key"], fixtureSecret(key));
        assert.equal(body.systemInstruction.parts[0].text, "A JSON writer instruction");
        assert.equal(body.generationConfig.responseMimeType, "application/json");
        assert.equal(body.generationConfig.maxOutputTokens, 2048);
      }
    },
  );
}

await check(
  "truncated writers and malformed or overbroad generated structures are rejected",
  async () => {
    const state = fixture();
    for (const [key, incomplete] of [
      ["ai.openai", { status: "incomplete" }],
      ["ai.anthropic", { stop_reason: "max_tokens" }],
      ["ai.gemini", { candidates: [{ finishReason: "MAX_TOKENS" }] }],
    ]) {
      const selected = await providers.resolveGrowthProvider(
        state.db,
        scope,
        bindingIds[key],
        "writer",
        env,
      );
      await assert.rejects(
        () =>
          providers.writeGrowthContent(selected, "JSON", {}, async () =>
            response(writerReply(key, output(), incomplete)),
          ),
        /did not complete/,
      );
    }
    const selected = await providers.resolveGrowthProvider(
      state.db,
      scope,
      bindingIds["ai.openai"],
      "writer",
      env,
    );
    for (const malformed of [
      "not-json",
      output({ variants: [] }),
      { ...output(), publishNow: true },
      output({ variants: [{ ...output().variants[0], evidenceIds: [] }] }),
    ]) {
      await assert.rejects(
        () =>
          providers.writeGrowthContent(selected, "JSON", {}, async () =>
            response(writerReply("ai.openai", malformed)),
          ),
        /invalid campaign structure/,
      );
    }
    const fenced = "```json\n" + JSON.stringify(output()) + "\n```";
    assert.deepEqual(
      (
        await providers.writeGrowthContent(selected, "JSON", {}, async () =>
          response(writerReply("ai.openai", fenced)),
        )
      ).output,
      output(),
    );
  },
);

await check(
  "Jev uses constrained review questions, validates decisions and retains observed model metadata",
  async () => {
    const state = fixture(),
      selected = await providers.resolveGrowthProvider(
        state.db,
        scope,
        bindingIds["ai.jev"],
        "classifier",
        env,
      );
    const http = transport(() => response(classifierReply()));
    const classification = await providers.classifyGrowthContent(
      selected,
      { evidence: "A product fact", draft: output() },
      http.fetcher,
    );
    assert.equal(http.calls.length, 1);
    assert.equal(http.calls[0].url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(http.calls[0].init.headers.authorization, `Bearer ${fixtureSecret("ai.jev")}`);
    assert.deepEqual(Object.keys(http.calls[0].body.questions), ["brand_fit", "claim_support"]);
    assert.equal(http.calls[0].body.questions.brand_fit.type, "choice");
    assert.match(http.calls[0].body.questions.claim_support.instructions, /untrusted/);
    assert.equal(classification.answers.brand_fit.choice, "matches");
    assert.equal(classification.provider.model, "jev-fixture");
    assert.equal(classification.provider.resolvedModel, "jev-fixture-resolved");
    for (const invalid of [
      { answers: {} },
      classifierReply({
        answers: {
          brand_fit: { choice: "approve", confidence: 0.9 },
          claim_support: { choice: "supported", confidence: 0.9 },
        },
      }),
      classifierReply({
        answers: {
          brand_fit: { choice: "matches", confidence: 1.1 },
          claim_support: { choice: "supported", confidence: 0.9 },
        },
      }),
    ]) {
      await assert.rejects(
        () => providers.classifyGrowthContent(selected, {}, async () => response(invalid)),
        /invalid review decisions/,
      );
    }
    await assert.rejects(
      () => providers.writeGrowthContent(selected, "JSON", {}, noFetch),
      /cannot write/,
    );
  },
);

await check(
  "input and streamed response byte limits stop oversized requests without retries",
  async () => {
    const state = fixture(),
      writer = await providers.resolveGrowthProvider(
        state.db,
        scope,
        bindingIds["ai.openai"],
        "writer",
        env,
      );
    const classifier = await providers.resolveGrowthProvider(
      state.db,
      scope,
      bindingIds["ai.jev"],
      "classifier",
      env,
    );
    await assert.rejects(
      () => providers.writeGrowthContent(writer, "JSON", { content: "😀".repeat(17000) }, noFetch),
      /too much source/,
    );
    await assert.rejects(
      () => providers.classifyGrowthContent(classifier, { content: "😀".repeat(23000) }, noFetch),
      /size limit/,
    );
    let cancelled = false,
      calls = 0;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_048_577));
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      () =>
        providers.writeGrowthContent(writer, "JSON", {}, async () => {
          calls++;
          return new Response(stream);
        }),
      /response exceeded/,
    );
    assert(cancelled);
    assert.equal(calls, 1);
    await assert.rejects(
      () => providers.writeGrowthContent(writer, "JSON", {}, async () => new Response(null)),
      /empty response/,
    );
    await assert.rejects(
      () => providers.writeGrowthContent(writer, "JSON", {}, async () => response("{not JSON")),
      /invalid JSON/,
    );
  },
);

await check(
  "provider errors, transport failures and output diagnostics do not leak upstream bodies",
  async () => {
    const state = fixture(),
      writer = await providers.resolveGrowthProvider(
        state.db,
        scope,
        bindingIds["ai.openai"],
        "writer",
        env,
      );
    const marker = "private-provider-body-fixture";
    for (const status of [401, 429, 500]) {
      const http = transport(() =>
        response({ error: marker, api_key: fixtureSecret("ai.openai") }, { status }),
      );
      await assert.rejects(
        () => providers.writeGrowthContent(writer, "JSON", {}, http.fetcher),
        (error) =>
          error instanceof providers.GrowthProviderError &&
          error.message.includes(`HTTP ${status}`) &&
          !error.message.includes(marker) &&
          !error.message.includes(fixtureSecret("ai.openai")),
      );
      assert.equal(http.calls.length, 1);
    }
    let calls = 0;
    await assert.rejects(
      () =>
        providers.writeGrowthContent(writer, "JSON", {}, async () => {
          calls++;
          throw new Error(marker);
        }),
      (error) => error instanceof providers.GrowthProviderError && !error.message.includes(marker),
    );
    assert.equal(calls, 1);
  },
);

await check(
  "timeouts abort writer and classifier once using their explicit request bounds",
  async () => {
    const state = fixture(),
      timer = globalThis.setTimeout;
    const durations = [];
    globalThis.setTimeout = (fn, duration, ...args) => {
      durations.push(duration);
      return timer(fn, 0, ...args);
    };
    try {
      for (const [key, purpose] of [
        ["ai.openai", "writer"],
        ["ai.jev", "classifier"],
      ]) {
        const selected = await providers.resolveGrowthProvider(
          state.db,
          scope,
          bindingIds[key],
          purpose,
          env,
        );
        let calls = 0;
        const abortedFetch = async (_url, init) => {
          calls++;
          return new Promise((_resolve, reject) =>
            init.signal.addEventListener(
              "abort",
              () => reject(new Error("private timeout transport diagnostic")),
              { once: true },
            ),
          );
        };
        const invoke =
          purpose === "writer"
            ? () => providers.writeGrowthContent(selected, "JSON", {}, abortedFetch)
            : () => providers.classifyGrowthContent(selected, {}, abortedFetch);
        await assert.rejects(invoke, /timed out/);
        assert.equal(calls, 1);
      }
      assert.deepEqual(durations, [30000, 20000]);
    } finally {
      globalThis.setTimeout = timer;
    }
  },
);

await check(
  "usage counts discard negative, fractional and nonnumeric provider values",
  async () => {
    const state = fixture(),
      writer = await providers.resolveGrowthProvider(
        state.db,
        scope,
        bindingIds["ai.openai"],
        "writer",
        env,
      );
    for (const usage of [
      { input_tokens: -1, output_tokens: 2.5 },
      { input_tokens: "10", output_tokens: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const generated = await providers.writeGrowthContent(writer, "JSON", {}, async () =>
        response(writerReply("ai.openai", output(), { usage })),
      );
      assert.equal(generated.provider.usage.inputTokens, undefined);
      assert.equal(generated.provider.usage.outputTokens, undefined);
    }
  },
);

await check(
  "model input contains source facts and evidence IDs but strips workspace and credential internals",
  async () => {
    const source = snapshot();
    source.brand.createdBy = ownerId;
    source.brand.internal = "private-internal-fixture";
    source.campaign.createdBy = ownerId;
    source.evidence[0].provenance = {
      credentialId: randomUUID(),
      externalRef: "internal-merchant-handle",
    };
    const prepared = runtime.growthWriterInput(source),
      serialised = JSON.stringify(prepared);
    assert(serialised.includes(evidenceId));
    assert(serialised.includes(source.evidence[0].sourceUrl));
    for (const excluded of [
      scope.tenantId,
      ownerId,
      brandId,
      campaignId,
      bindingIds["ai.openai"],
      "private-internal-fixture",
      "internal-merchant-handle",
      "credentialId",
      "createdAt",
      "updatedAt",
    ])
      assert(!serialised.includes(excluded), excluded);
    assert.match(runtime.GROWTH_WRITER_INSTRUCTIONS, /untrusted reference data/);
    assert.match(runtime.GROWTH_WRITER_INSTRUCTIONS, /You have no tools/);
    for (const locale of ["en", "ur", "es"]) {
      source.campaign.locale = locale;
      assert.equal(runtime.growthWriterInput(source).campaign.locale, locale);
    }
  },
);

await check(
  "output checks detect foreign citations, expiry, missing disclosures and duplicate variants",
  async () => {
    const source = snapshot(),
      draft = output();
    const good = runtime.checkGrowthOutput(source, draft);
    assert(!good.some((item) => item.status === "fail"));
    assert.equal(failStatus(good, "human_review"), "review");
    const foreign = output();
    foreign.variants[0].evidenceIds = [randomUUID()];
    assert.equal(failStatus(runtime.checkGrowthOutput(source, foreign), "evidence_refs"), "fail");
    const expired = copy(source);
    expired.evidence[0].validUntil = "2000-01-01T00:00:00Z";
    assert.equal(
      failStatus(runtime.checkGrowthOutput(expired, draft), "evidence_validity"),
      "fail",
    );
    expired.evidence[0].validUntil = null;
    assert.equal(
      failStatus(runtime.checkGrowthOutput(expired, draft), "evidence_validity"),
      "fail",
    );
    const affiliate = copy(source);
    affiliate.campaign.productKey = "affivon";
    assert.equal(failStatus(runtime.checkGrowthOutput(affiliate, draft), "disclosure"), "fail");
    affiliate.brand.disclosure = "We may earn commission.";
    assert.equal(failStatus(runtime.checkGrowthOutput(affiliate, draft), "disclosure"), "fail");
    const disclosed = output();
    disclosed.variants[0].disclosure = affiliate.brand.disclosure;
    assert.equal(failStatus(runtime.checkGrowthOutput(affiliate, disclosed), "disclosure"), "pass");
    const duplicate = output();
    duplicate.variants.push(copy(duplicate.variants[0]));
    assert.equal(failStatus(runtime.checkGrowthOutput(source, duplicate), "variant_keys"), "fail");
  },
);

await check(
  "workspace access reflects tenant/product activation, dated services and role permissions",
  async () => {
    for (const [role, canWrite, canReview] of [
      ["owner", true, true],
      ["admin", true, true],
      ["agent", true, false],
      ["viewer", false, false],
    ]) {
      const state = fixture({ role }),
        access = await runtime.getGrowthAccess(state.context, scope);
      assert.equal(access.allowed, true);
      assert.equal(access.canWrite, canWrite);
      assert.equal(access.canReview, canReview);
      if (!canWrite)
        await assert.rejects(
          () => runtime.assertGrowthAccess(state.context, scope, "write"),
          /Write access/,
        );
    }
    for (const mutate of [
      (state) => {
        state.rows.tenants[0].status = "suspended";
      },
      (state) => {
        state.rows.tenant_products[0].status = "requested";
      },
      (state) => {
        state.rows.tenant_services[0].status = "suspended";
      },
      (state) => {
        state.rows.tenant_services[0].valid_from = "2099-01-01T00:00:00Z";
      },
      (state) => {
        state.rows.tenant_services[0].valid_until = "2000-01-01T00:00:00Z";
      },
    ]) {
      const state = fixture();
      mutate(state);
      assert.equal((await runtime.getGrowthAccess(state.context, scope)).allowed, false);
    }
    const noCreative = fixture();
    noCreative.rows.tenant_services[1].status = "suspended";
    assert.equal((await runtime.getGrowthAccess(noCreative.context, scope)).canHandoff, false);
    const missing = fixture();
    missing.rows.tenant_members = [];
    await assert.rejects(
      () => runtime.getGrowthAccess(missing.context, scope),
      /Tenant access required/,
    );
  },
);

await check(
  "a generated run persists structured output and stays pending for human review",
  async () => {
    const state = fixture(),
      http = transport(() => response(writerReply("ai.openai")));
    const run = await withRuntime(state, http.fetcher);
    assert.equal(http.calls.length, 1);
    assert.equal(state.starts.length, 1);
    assert.equal(state.finishes.length, 1);
    assert.equal(run.status, "completed");
    assert.equal(run.reviewStatus, "pending");
    assert.deepEqual(run.result.output, output());
    assert.equal(run.marketingCampaignId, null);
    assert.equal(run.creativeBriefId, null);
    assert.equal(failStatus(run.result.checks, "human_review"), "review");
    assert.equal(failStatus(run.result.checks, "jev"), "review");
  },
);

await check(
  "repeated request keys return saved results with zero additional provider spend",
  async () => {
    const state = fixture(),
      http = transport(() => response(writerReply("ai.openai")));
    await withRuntime(state, http.fetcher, async () => {
      const first = await runtime.runGrowthCampaign(state.context, state.input);
      const second = await runtime.runGrowthCampaign(state.context, state.input);
      assert.deepEqual(second, first);
      assert.equal(http.calls.length, 1);
      assert.equal(state.finishes.length, 1);
      state.rows.provider_bindings[0].status = "disabled";
      const disabledReplay = await runtime.runGrowthCampaign(state.context, state.input);
      assert.deepEqual(disabledReplay, first);
      assert.equal(http.calls.length, 1);
      state.rows.provider_bindings[0].status = "configured";
      state.rows.provider_bindings[0].config.model = "new-writer-model";
      assert.deepEqual(await runtime.runGrowthCampaign(state.context, state.input), first);
      assert.equal(http.calls.length, 1);
      await assert.rejects(
        () =>
          runtime.runGrowthCampaign(state.context, { ...state.input, campaignId: randomUUID() }),
        /request|generation|key/i,
      );
      await assert.rejects(
        () =>
          runtime.runGrowthCampaign(state.context, {
            ...state.input,
            writerBindingId: bindingIds["ai.anthropic"],
          }),
        /request|generation|key/i,
      );
      assert.equal(http.calls.length, 1);
    });
  },
);

await check(
  "missing, disabled and foreign writers create blocked runs without a provider call",
  async () => {
    for (const mutate of [
      (state) => {
        state.input.writerBindingId = null;
      },
      (state) => {
        state.rows.provider_bindings[0].status = "disabled";
      },
      (state) => {
        state.rows.provider_bindings[0].tenant_id = randomUUID();
      },
      (state) => {
        state.rows.provider_bindings[0].secret_refs.api_key = "env:PATH";
      },
    ]) {
      const state = fixture();
      mutate(state);
      const run = await withRuntime(state, noFetch);
      assert.equal(run.status, "blocked");
      assert.equal(run.result, null);
      assert.equal(state.finishes.length, 1);
    }
    const viewer = fixture({ role: "viewer" });
    await assert.rejects(() => withRuntime(viewer, noFetch), /Write access/);
    assert.equal(viewer.starts.length, 0);
  },
);

await check(
  "provider authorization is rechecked after claiming and before spending on a writer",
  async () => {
    const state = fixture();
    state.onStart = () => {
      state.rows.provider_bindings[0].status = "disabled";
    };
    const run = await withRuntime(state, noFetch);
    assert.equal(run.status, "blocked");
    assert.equal(run.result, null);
    const revoked = fixture();
    revoked.onStart = () => {
      revoked.rows.tenants[0].status = "suspended";
    };
    const denied = await withRuntime(revoked, noFetch);
    assert.notEqual(denied.status, "completed");
    assert.equal(denied.reviewStatus, "pending");
  },
);

await check(
  "a classifier disabled during writing receives no draft, evidence or paid request",
  async () => {
    const state = fixture();
    state.input.classifierBindingId = bindingIds["ai.jev"];
    const http = transport((call) => {
      assert.equal(call.url, "https://api.openai.com/v1/responses");
      state.rows.provider_bindings.find((row) => row.provider_key === "ai.jev").status = "disabled";
      return response(writerReply("ai.openai"));
    });
    const run = await withRuntime(state, http.fetcher);
    assert.equal(http.calls.length, 1);
    assert.equal(run.status, "blocked");
    assert.deepEqual(run.result.output, output());
    assert.equal(run.reviewStatus, "pending");
  },
);

await check(
  "classifier failure retains the generated draft without completing or approving it",
  async () => {
    const state = fixture();
    state.input.classifierBindingId = bindingIds["ai.jev"];
    const http = transport((call) =>
      call.url.includes("typesafe.ai")
        ? response({ error: "private-classifier-diagnostic" }, { status: 503 })
        : response(writerReply("ai.openai")),
    );
    const run = await withRuntime(state, http.fetcher);
    assert.equal(http.calls.length, 2);
    assert.equal(run.status, "failed");
    assert.deepEqual(run.result.output, output());
    assert.equal(run.reviewStatus, "pending");
    assert.equal(run.result.classification, undefined);
    assert(!run.error.includes("private-classifier-diagnostic"));
    assert.equal(state.finishes.length, 1);
  },
);

await check(
  "Jev confidence and rejection become review checks and never automatic approval",
  async () => {
    const state = fixture();
    state.input.classifierBindingId = bindingIds["ai.jev"];
    const http = transport((call) =>
      response(
        call.url.includes("typesafe.ai")
          ? classifierReply({
              answers: {
                brand_fit: { choice: "matches", confidence: 0.5 },
                claim_support: { choice: "reject", confidence: 0.95 },
              },
            })
          : writerReply("ai.openai"),
      ),
    );
    const run = await withRuntime(state, http.fetcher);
    assert.equal(run.status, "completed");
    assert.equal(run.reviewStatus, "pending");
    assert.equal(failStatus(run.result.checks, "jev_brand_fit"), "review");
    assert.equal(failStatus(run.result.checks, "jev_claim_support"), "fail");
    assert.equal(run.marketingCampaignId, null);
    assert.equal(run.creativeBriefId, null);
  },
);

await check("writer and classifier revocation or changed config blocks completion", async () => {
  for (const mutate of [
    (state) => {
      state.rows.provider_bindings[0].status = "disabled";
    },
    (state) => {
      state.rows.provider_bindings[0].config.max_output_tokens = 1024;
    },
  ]) {
    const state = fixture(),
      http = transport(() => {
        mutate(state);
        return response(writerReply("ai.openai"));
      });
    const run = await withRuntime(state, http.fetcher);
    assert.equal(run.status, "blocked");
    assert.equal(run.reviewStatus, "pending");
    assert.equal(http.calls.length, 1);
  }
  for (const mutate of [
    (row) => {
      row.status = "disabled";
    },
    (row) => {
      row.config.review_policy = "changed-during-generation";
    },
  ]) {
    const state = fixture();
    state.input.classifierBindingId = bindingIds["ai.jev"];
    const http = transport((call) => {
      if (!call.url.includes("typesafe.ai")) return response(writerReply("ai.openai"));
      mutate(state.rows.provider_bindings.find((row) => row.provider_key === "ai.jev"));
      return response(classifierReply());
    });
    const run = await withRuntime(state, http.fetcher);
    assert.equal(run.status, "blocked");
    assert.equal(run.reviewStatus, "pending");
    assert.equal(http.calls.length, 2);
  }
});

await check(
  "expired input is blocked before a writer call and failed checks survive persistence",
  async () => {
    const expired = fixture();
    expired.snapshot.evidence[0].validUntil = "2000-01-01T00:00:00Z";
    assert.equal((await withRuntime(expired, noFetch)).status, "blocked");
    const state = fixture(),
      malformedRefs = output();
    malformedRefs.variants[0].evidenceIds = [randomUUID()];
    const run = await withRuntime(state, async () =>
      response(writerReply("ai.openai", malformedRefs)),
    );
    assert.equal(run.status, "completed");
    assert.equal(run.reviewStatus, "pending");
    assert.equal(failStatus(run.result.checks, "evidence_refs"), "fail");
  },
);

await check("a completion-storage failure never triggers another provider request", async () => {
  const state = fixture(),
    http = transport(() => response(writerReply("ai.openai")));
  state.beforeFinish = (_args, count) => {
    if (count === 1) throw new Error("private-database-fixture-diagnostic");
  };
  const run = await withRuntime(state, http.fetcher);
  assert.equal(http.calls.length, 1);
  assert.equal(state.finishes.length, 2);
  assert.equal(run.status, "failed");
  assert.deepEqual(run.result.output, output());
  assert(!run.error.includes("private-database-fixture-diagnostic"));
});

console.log(`Growth Studio runtime/provider verification: ${passed} groups passed.`);
