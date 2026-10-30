import { createPostgresSupplierApprovalReader } from "../supplier-approvals.mjs";
import { createLiveFlightSearch } from "./live-search.mjs";
import { createFlexibleFlightSearch } from "./flexible-search.mjs";
import { createTravellerFlightSession } from "./traveller-session.mjs";
import { createTravellerFlightHandler } from "./traveller-http.mjs";
import { validScope } from "./offer-store.mjs";

// Server composition only. Neither environment flags nor browser identity grant access.
export function createFlightLoungeRuntime({
  siteOrigin,
  db,
  resolveAccess,
  authorizePassenger,
  secretReader,
  controls,
  offerStore,
  activation,
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMs,
} = {}) {
  const readApproval = db?.query ? createPostgresSupplierApprovalReader({ db }) : null;
  const ready = () =>
    activation?.commercialApproval === true &&
    activation?.secureConfiguration === true &&
    activation?.hostedStagingAccepted === true &&
    activation?.liveSearchEnabled === true;
  const configured = () =>
    ready() &&
    readApproval &&
    resolveAccess &&
    authorizePassenger &&
    secretReader &&
    controls?.reserveBudget &&
    controls?.audit &&
    offerStore?.put &&
    offerStore?.get &&
    offerStore?.remove;
  async function access(context, signal) {
    if (!configured() || signal?.aborted || !validScope(context)) return { allowed: false };
    const grant = await authorizePassenger({ ...context, product: "flights" }, { signal });
    if (
      signal?.aborted ||
      grant?.allowed !== true ||
      grant.tenantId !== context.tenantId ||
      grant.actorId !== context.actorId
    )
      return { allowed: false };
    const approval = await readApproval({
      tenantId: context.tenantId,
      supplierKey: "duffel",
      productType: "flights",
    }, { signal });
    return approval && !signal?.aborted
      ? { allowed: true, ...context, supplier: "duffel" }
      : { allowed: false };
  }
  const session = Object.fromEntries(
    ["search", "flexibleSearch", "refresh"].map((method) => [
      method,
      async (context, raw, { signal } = {}) => {
        let credits = 0,
          budgetDenied = false;
        const currentAccess = (operationSignal) => access(context, operationSignal);
        const authorize = () => currentAccess(signal);
        const audit = (event, operationSignal = signal) => controls.audit({ ...event, ...context }, { signal: operationSignal });
        async function reserve(calls, operationSignal = signal) {
          if (!(await currentAccess(operationSignal)).allowed) return { allowed: false };
          const grant = await controls.reserveBudget({ ...context, calls }, { signal: operationSignal });
          if (
            operationSignal?.aborted ||
            grant?.allowed !== true ||
            grant.tenantId !== context.tenantId ||
            grant.actorId !== context.actorId
          )
            return { allowed: false };
          credits += calls;
          return grant;
        }
        // All network calls pass this last authorization gate, including every flexible candidate.
        const guardedFetch = async (url, init) => {
          const operationSignal = AbortSignal.any([signal, init.signal].filter(Boolean));
          if (!(await currentAccess(operationSignal)).allowed) throw Error("access_denied");
          if (operationSignal.aborted) throw Error("cancelled");
          if (!credits && !(await reserve(1, operationSignal)).allowed) {
            budgetDenied = true;
            throw Error("budget_denied");
          }
          credits--;
          await audit({ event: "supplier_dispatch", supplier: "duffel" }, operationSignal);
          if (!(await currentAccess(operationSignal)).allowed || operationSignal.aborted) throw Error("access_revoked");
          let result;
          const discard = () => {
            try { Promise.resolve(result?.body?.cancel()).catch(() => {}); } catch {}
          };
          // Own the response until the audit succeeds and the body reader takes over.
          // Cancellation must release it even if the audit provider ignores its signal.
          operationSignal.addEventListener("abort", discard, { once: true });
          try {
            result = await fetchImpl(url, { ...init, signal: operationSignal });
            if (operationSignal.aborted) throw Error("cancelled");
            await audit({
              event: "supplier_response",
              supplier: "duffel",
              httpStatus: result.status,
            }, operationSignal);
            if (operationSignal.aborted) throw Error("cancelled");
            return result;
          } catch {
            discard();
            if (!operationSignal.aborted)
              await audit({ event: "supplier_failed", supplier: "duffel" }, operationSignal);
            throw Error("supplier_failed");
          } finally {
            operationSignal.removeEventListener("abort", discard);
          }
        };
        const secrets = async (tenant, supplier) => {
          if (tenant !== context.tenantId || supplier !== "duffel" || !(await authorize()).allowed)
            throw Error("secret_access_denied");
          return secretReader(tenant, supplier, { signal });
        };
        const options = { authorize, secretReader: secrets, audit, fetchImpl: guardedFetch, now };
        const searchService = createLiveFlightSearch(options);
        const flexibleSearchService = createFlexibleFlightSearch({
          flightSearch: searchService,
          authorize,
          reserveBudget: ({ calls }) => reserve(calls),
          audit,
          now,
        });
        const traveller = createTravellerFlightSession({
          searchService,
          flexibleSearchService,
          offerStore,
          authorize,
          refreshOptions: options,
          now,
        });
        const answer = await traveller[method](context, raw, { signal });
        return budgetDenied
          ? {
              httpStatus: 429,
              status: "unavailable",
              reason: "search_budget_unavailable",
              offers: [],
              bookingsEnabled: false,
            }
          : answer;
      },
    ]),
  );
  return createTravellerFlightHandler({
    siteOrigin,
    now,
    timeoutMs,
    session,
    resolveAccess: async (request, options) => {
      if (!configured()) return { allowed: false };
      const grant = await resolveAccess(request, options);
      if (grant?.allowed !== true || !validScope(grant)) return { allowed: false };
      return access({ tenantId: grant.tenantId, actorId: grant.actorId }, options.signal);
    },
    audit: async (event, options) => {
      if (!configured()) throw Error("not_configured");
      await controls.audit(event, options);
    },
  });
}
