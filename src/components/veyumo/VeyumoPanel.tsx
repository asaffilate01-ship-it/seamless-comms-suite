"use client";
import { useCallback, useEffect, useState } from "react";

type Command = { action: string; offerId?: string; token?: string };
type Workspace = {
  linked: boolean;
  accountId?: string;
  market: string;
  eligible?: boolean;
  purchasesEnabled: boolean;
  canManage?: boolean;
  offers: {
    id: string;
    name: string;
    description: string;
    monthlyMinor: number;
    currency: string;
    requiresSubscription: boolean;
    termsUrl: string;
  }[];
  subscriptions: {
    id: string;
    status: string;
    plan_name: string | null;
    phone_number: string | null;
    updated_at: string;
  }[];
  serviceEvents?: { event_id: string; status: string; observed_at: string }[];
};
export type VeyumoCall = (command: Command) => Promise<any>;
const messages: Record<string, string> = {
  mobile_account_setup_pending:
    "Your mobile account setup is pending. Contact support before trying another checkout.",
  sign_in_required: "Sign in to connect your account.",
  verify_email_first: "Verify your email address before connecting.",
  business_owner_required: "Your business owner can connect this workspace.",
  invalid_or_expired_link:
    "This code has expired or has already been used. Generate a new one in your connected app.",
  account_already_linked:
    "This workspace is already connected. Contact support to move it to another account.",
  market_mismatch:
    "These accounts belong to different countries. Contact support to check your setup.",
  offer_unavailable: "This offer is no longer available. Refresh to see your current options.",
  mobile_sales_not_open: "Mobile purchases are not open yet.",
  mobile_provider_unavailable:
    "The mobile provider could not complete this request. Please try again later.",
  no_mobile_account: "Choose your first mobile plan to open plan management.",
};
const safeLink = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : undefined;
  } catch {
    return undefined;
  }
};
export function VeyumoPanel({ call, appName }: { call: VeyumoCall; appName: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState<{ token: string; expiresAt: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const run = useCallback(
    async (command: Command) => {
      setBusy(true);
      setError("");
      try {
        const result = await call(command);
        if (result?.error) throw new Error(result.error);
        if (result?.url) {
          const target = safeLink(result.url);
          if (!target) throw new Error("invalid_checkout");
          window.location.assign(target);
          return;
        }
        if (result?.token) {
          setCode(result);
          return;
        }
        if (
          typeof result?.linked !== "boolean" ||
          !Array.isArray(result.offers) ||
          !Array.isArray(result.subscriptions)
        )
          throw new Error("invalid_response");
        setWorkspace(result);
        if (command.action === "claimLink") {
          setToken("");
          setConsent(false);
        }
      } catch (e) {
        const key = e instanceof Error ? e.message : "";
        setError(messages[key] || "Mobile connections are being set up. Please try again later.");
      } finally {
        setBusy(false);
      }
    },
    [call],
  );
  useEffect(() => {
    void run({ action: "workspace" });
  }, [run]);
  const button =
    "rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <section
      aria-label="Veyumo mobile connections"
      className="my-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm md:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Your world. Connected.
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">veyumo</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
          {workspace?.market === "DE" ? "Germany" : "United Kingdom"} · Mobile
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Connect {appName} to your Veyumo account to see available mobile plans and manage your
        connections.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {error}
        </p>
      )}
      {!workspace && (
        <button
          type="button"
          className={button + " mt-4"}
          disabled={busy}
          onClick={() => void run({ action: "workspace" })}
        >
          {busy ? "Loading…" : "Try again"}
        </button>
      )}
      {workspace && !workspace.linked && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <h3 className="font-semibold">First time with Veyumo?</h3>
            <p className="mt-1 text-sm text-slate-600">
              Create an account for this workspace. Creating an account does not buy a plan.
            </p>
            <button
              type="button"
              className={button + " mt-3 bg-slate-900 text-white"}
              disabled={busy}
              onClick={() => void run({ action: "createAccount" })}
            >
              Create Veyumo account
            </button>
          </div>
          <form
            className="rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (consent) void run({ action: "claimLink", token: token.trim() });
            }}
          >
            <h3 className="font-semibold">Already connected in another app?</h3>
            <p className="mt-1 text-sm text-slate-600">
              Generate a connection code in that app and paste it here. Do this before creating a
              separate account.
            </p>
            <label className="mt-3 block text-sm">
              Connection code
              <input
                className="mt-1 block w-full rounded-lg border px-3 py-2 font-mono text-xs"
                value={token}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I am authorised to give this workspace access to all mobile lines and billing in
                that Veyumo account.
              </span>
            </label>
            <button
              type="submit"
              className={button + " mt-3"}
              disabled={busy || !consent || !/^[a-f0-9]{64}$/.test(token.trim())}
            >
              Connect existing account
            </button>
          </form>
        </div>
      )}
      {workspace?.linked && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
              Account connected
            </span>
            {workspace.eligible && (
              <span className="text-xs text-slate-600">App subscription verified</span>
            )}
            <button
              type="button"
              className={button + " ml-auto"}
              disabled={busy}
              onClick={() => void run({ action: "refresh" })}
            >
              Refresh
            </button>
          </div>
          {!workspace.purchasesEnabled && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm">
              Mobile sales are not open yet. Your account can be connected now; approved plans will
              appear here when available.
            </p>
          )}
          <div>
            <h3 className="font-semibold">Your mobile lines</h3>
            {workspace.subscriptions.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                No mobile lines have been confirmed for this account.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {workspace.subscriptions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <strong>{s.plan_name || "Mobile plan"}</strong>
                      <p className="text-slate-600">{s.phone_number || "Number pending"}</p>
                    </div>
                    <div>
                      <span>{s.status}</span>
                      <p className="text-xs text-slate-500">
                        Updated {new Date(s.updated_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {workspace.canManage && (
              <button
                type="button"
                className={button + " mt-3"}
                disabled={busy || !workspace.purchasesEnabled}
                onClick={() => void run({ action: "manage" })}
              >
                Open mobile plan management
              </button>
            )}
          </div>
          {workspace.offers.length > 0 && (
            <div>
              <h3 className="font-semibold">Available plans</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {workspace.offers.map((o) => (
                  <article key={o.id} className="rounded-xl border p-4">
                    <h4 className="font-semibold">{o.name}</h4>
                    <p className="mt-2 text-sm text-slate-600">{o.description}</p>
                    <p className="mt-3 text-xl font-semibold">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: o.currency,
                      }).format(o.monthlyMinor / 100)}
                      <span className="text-sm font-normal"> / month</span>
                    </p>
                    {o.requiresSubscription && (
                      <p className="mt-1 text-xs">Requires an eligible app subscription.</p>
                    )}
                    {safeLink(o.termsUrl) && (
                      <a
                        href={safeLink(o.termsUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block text-sm underline"
                      >
                        Allowances, roaming and full terms
                      </a>
                    )}
                    <button
                      type="button"
                      className={button + " mt-3 bg-slate-900 text-white"}
                      disabled={busy || !workspace.purchasesEnabled}
                      onClick={() => void run({ action: "checkout", offerId: o.id })}
                    >
                      Review plan & checkout
                    </button>
                  </article>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Review the final price, contract and any delivery charges in secure checkout before
                purchasing.
              </p>
            </div>
          )}
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-semibold">Connect another app</summary>
            <p className="mt-2 text-sm text-slate-600">
              A code grants account owner access, including all lines and billing. Use it only in
              your own trusted app account. It expires in ten minutes and works once.
            </p>
            <button
              type="button"
              className={button + " mt-3"}
              disabled={busy}
              onClick={() => void run({ action: "createLink" })}
            >
              Generate connection code
            </button>
            {code && (
              <div className="mt-3">
                <label className="block text-xs">
                  Copy your connection code
                  <input
                    readOnly
                    className="mt-1 w-full rounded border p-2 font-mono text-xs"
                    value={code.token}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <p className="mt-1 text-xs">
                  Expires {new Date(code.expiresAt).toLocaleTimeString()}
                </p>
              </div>
            )}
          </details>
          {workspace.serviceEvents && (
            <div className="text-sm text-slate-600">
              <p>
                {workspace.serviceEvents.length
                  ? "Recent mobile service updates are connected."
                  : "No mobile service updates received yet."}
              </p>
              <p className="mt-1">
                Service updates do not credit rewards or change your payment balance.
              </p>
            </div>
          )}
        </div>
      )}
      <p className="mt-5 border-t pt-4 text-xs text-slate-500">
        Mobile billing is handled through the mobile checkout. Your existing app subscription
        continues separately.
      </p>
    </section>
  );
}

