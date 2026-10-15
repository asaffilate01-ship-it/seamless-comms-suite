#!/usr/bin/env node
/**
 * Read-only GitHub Actions triage for the SaaS portfolio.
 * An instant no-step failure is a SIGNAL, not a confirmed billing diagnosis.
 *
 * Usage:
 *   GH_TOKEN=... node scripts/factory-ci-diagnose.mjs --repo owner/repo
 *   GH_TOKEN=... node scripts/factory-ci-diagnose.mjs --repo owner/a --repo owner/b --markdown
 *
 * This tool never installs dependencies, reruns jobs, changes billing or writes to GitHub.
 */
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;
const API = "https://api.github.com";
const LIMIT = 10;

export function classifyRun(run, jobs = []) {
  const durationMs = Date.parse(run.updated_at ?? "") - Date.parse(run.created_at ?? "");
  const durationSeconds = Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs / 1000) : null;
  const jobCount = jobs.length;
  const stepCount = jobs.reduce((n, j) => n + (Array.isArray(j.steps) ? j.steps.length : 0), 0);
  const failedJobs = jobs.filter(j => j.conclusion === "failure").length;
  const summary = {
    workflow: String(run.name ?? ""),
    runId: Number(run.id ?? 0),
    runUrl: String(run.html_url ?? ""),
    conclusion: String(run.conclusion ?? run.status ?? "unknown"),
    durationSeconds,
    jobCount,
    failedJobs,
    observedStepCount: stepCount,
    classification: "not_diagnosed",
    note: "This check reports evidence only, not root-cause certainty."
  };
  if (run.status !== "completed") {
    summary.classification = "still_running";
    return summary;
  }
  if (run.conclusion === "success") {
    summary.classification = "workflow_passed";
    summary.note = "CI passed; live deployment and integrations remain independently unverified.";
  } else if (run.conclusion === "skipped") {
    summary.classification = "workflow_skipped";
    summary.note = "No execution evidence. Scheduled skips may be intentional.";
  } else if (run.conclusion === "failure" && durationSeconds !== null
      && durationSeconds <= 15 && stepCount === 0 && (failedJobs > 0 || jobCount === 0)) {
    summary.classification = "possible_pre_runner_failure";
    summary.note = "Job failed in <=15 seconds with no observed steps. Inspect run annotations and owner Actions billing/runner settings before changing app code.";
  } else if (run.conclusion === "failure" && stepCount > 0) {
    summary.classification = "executed_steps_failed";
    summary.note = "Steps executed; review the failed step logs and actual test errors.";
  } else if (run.conclusion === "failure") {
    summary.classification = "failure_needs_run_annotations";
    summary.note = "Failure without sufficient step/timing evidence. Review run annotations and logs.";
  } else if (run.conclusion === "cancelled") {
    summary.classification = "cancelled_unverified";
    summary.note = "Cancelled runs do not establish test success or failure.";
  }
  return summary;
}

export function selectRecentActionRun(runs) {
  if (!Array.isArray(runs)) return null;
  return runs.find(r => r && r.conclusion !== "skipped" && r.conclusion !== "cancelled") ?? runs[0] ?? null;
}

async function getJson(path, token, fetchImpl) {
  const url = API + path;
  const response = await fetchImpl(url, {
    method:"GET", redirect:"error",
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      Authorization:"Bearer " + token
    },
    signal:AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    // Do not log response text: it may contain account details.
    throw new Error(response.status === 404 ? "not_found_or_no_access"
      : response.status === 403 ? "permission_or_rate_limit"
      : "github_http_" + response.status);
  }
  return response.json();
}

export async function diagnoseRepo(repo, token, fetchImpl = fetch) {
  if (typeof repo !== "string" || !REPO.test(repo) || repo.includes("..")) {
    throw new Error("invalid_repository_name");
  }
  if (!token) throw new Error("missing_read_only_GH_TOKEN");
  const encoded = repo.split("/").map(encodeURIComponent).join("/");
  const {workflow_runs: runs} = await getJson("/repos/" + encoded + "/actions/runs?per_page=" + LIMIT, token, fetchImpl);
  const recent = selectRecentActionRun(runs);
  if (!recent) return {repository:repo,classification:"no_action_runs",note:"No accessible workflow runs found."};
  const jobsPayload = await getJson("/repos/" + encoded + "/actions/runs/" + encodeURIComponent(String(recent.id)) + "/jobs?per_page=100", token, fetchImpl);
  return {repository:repo,...classifyRun(recent,jobsPayload.jobs ?? [])};
}

export function renderMarkdown(rows) {
  return [
    "# GitHub Actions portfolio triage (read-only)",
    "",
    "This shows observed run outcomes, **not** confirmed root causes, product readiness, or live service status.",
    "",
    "| Repository | Last meaningful workflow | Classification | Duration |",
    "|---|---|---|---:|",
    ...rows.map(r=> "| " + r.repository + " | " + (r.workflow || "—").replace(/\|/g,"/") +
      " | " + r.classification + " | " + (r.durationSeconds === undefined || r.durationSeconds === null ? "—" : r.durationSeconds + "s") + " |"),
    "",
    "For possible pre-runner failures, open the GitHub run summary **annotations** first. Check account Actions budget, unpaid invoices, payment methods and runner access. Escalate to GitHub Support if billing appears clear. Do not treat the signal as a proven billing error.",
    ""
  ].join("\n");
}

async function main() {
  const args=process.argv.slice(2), repos=[];
  let markdown=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==="--repo" && args[i+1]) repos.push(args[++i]);
    else if(args[i]==="--markdown") markdown=true;
    else throw new Error("Usage: --repo owner/name [--repo owner/name...] [--markdown]");
  }
  if(!repos.length || repos.length>20) throw new Error("Provide 1–20 repositories explicitly; there is no automatic mass scan.");
  const token=process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if(!token) throw new Error("GH_TOKEN or GITHUB_TOKEN (fine-grained Actions:read) is required.");
  const output=[];
  for(const repository of [...new Set(repos)]) {
    try { output.push(await diagnoseRepo(repository,token)); }
    catch(error) { output.push({repository,classification:"check_unavailable",note:String(error.message).slice(0,100)}); }
  }
  process.stdout.write(markdown?renderMarkdown(output)+"\n":JSON.stringify({classificationVersion:"1.0",asOf:new Date().toISOString(),results:output},null,2)+"\n");
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await main().catch(error=>{
    process.stderr.write("Actions triage: " + String(error.message).slice(0,180) + "\n");
    process.exitCode=1;
  });
}
