import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accessSchema } from "@/modules/rrci/contracts";
import {
  customTemplateSchema,
  editSchema,
  type Assessment,
  type Requirement,
  type Snapshot,
} from "./contracts";
import { buildDossier } from "./readiness";

const workspace = z.string().uuid();
const id = z.string().uuid();
const version = z.number().int().positive();
const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("snapshot"), workspace, assessment: id.optional() }).strict(),
  z
    .object({
      operation: z.literal("create"),
      workspace,
      pack: z.string().max(100),
      name: z.string().trim().min(3).max(160),
      entity: z.string().trim().min(2).max(200),
      scope: z.string().trim().min(10).max(2000),
      buyer: z.string().trim().min(2).max(200),
      country: z.string().trim().min(2).max(100),
    })
    .strict(),
  z.object({ operation: z.literal("save"), workspace, id, version, changes: editSchema }).strict(),
  z
    .object({
      operation: z.literal("review"),
      workspace,
      id,
      version,
      decision: z.enum(["reviewed", "not_applicable", "in_progress"]),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("add"),
      workspace,
      assessment: id,
      template: customTemplateSchema,
    })
    .strict(),
  z.object({ operation: z.literal("export"), workspace, assessment: id }).strict(),
]);
export type ProcurementRequest = z.infer<typeof requestSchema>;

// Use the caller's JWT and database RLS; never a browser-supplied role or service-role client.
export const procurementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(requestSchema)
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const accessResult = await db.rpc("get_rrci_access", { _workspace: data.workspace });
    if (accessResult.error)
      throw new Error("Procurement readiness is awaiting database activation.");
    const [access] = z.array(accessSchema).parse(accessResult.data);
    const permission = {
      snapshot: "read",
      create: "write",
      save: "write",
      add: "write",
      review: "approve",
      export: "read",
    }[data.operation];
    if (!access || access.subject !== context.userId || !access.permissions.includes(permission))
      throw new Error("Readiness access denied.");
    async function rows<T>(table: string, assessment?: string): Promise<T[]> {
      const all: T[] = [];
      for (let page = 0; page < 100; page++) {
        let query = db
          .from(table)
          .select("*")
          .eq("workspace_id", data.workspace)
          .order("id")
          .range(page * 500, page * 500 + 499);
        if (assessment) query = query.eq("assessment_id", assessment);
        const result = await query;
        if (result.error)
          throw new Error(
            "Unable to load readiness records. Check the database migration and workspace access.",
          );
        all.push(...(result.data as T[]));
        if (result.data.length < 500) return all;
      }
      throw new Error("This workspace is too large to load in one request.");
    }
    async function checkedAssessment(assessment: string) {
      const result = await db
        .from("procurement_assessments")
        .select("*")
        .eq("workspace_id", data.workspace)
        .eq("id", assessment)
        .maybeSingle();
      if (result.error || !result.data) throw new Error("Assessment access denied.");
      return result.data as Assessment;
    }
    let payload: unknown = {};
    if (data.operation === "snapshot") {
      if (data.assessment) await checkedAssessment(data.assessment);
      const snapshot: Snapshot = {
        assessments: await rows<Assessment>("procurement_assessments"),
        requirements: [],
        audit: [],
      };
      if (data.assessment) {
        snapshot.requirements = await rows<Requirement>(
          "procurement_requirements",
          data.assessment,
        );
        if (access.permissions.includes("audit")) {
          const result = await db
            .from("procurement_audit")
            .select("id,assessment_id,actor,action,created_at,detail")
            .eq("workspace_id", data.workspace)
            .eq("assessment_id", data.assessment)
            .order("id", { ascending: false })
            .limit(100);
          if (result.error) throw new Error("Unable to load audit records.");
          snapshot.audit = result.data;
        }
      }
      payload = snapshot;
    } else if (data.operation === "export") {
      const assessment = await checkedAssessment(data.assessment);
      const items = await rows<Requirement>("procurement_requirements", data.assessment);
      const result = await db.rpc("record_procurement_export", { _assessment: data.assessment });
      if (result.error) throw new Error(result.error.message);
      payload = buildDossier(assessment, items);
    } else {
      if (data.operation === "save" || data.operation === "review") {
        const result = await db
          .from("procurement_requirements")
          .select("id")
          .eq("workspace_id", data.workspace)
          .eq("id", data.id)
          .maybeSingle();
        if (result.error || !result.data) throw new Error("Requirement access denied.");
      }
      if (data.operation === "add") await checkedAssessment(data.assessment);
      const result =
        data.operation === "create"
          ? await db.rpc("create_procurement_assessment", {
              _workspace: data.workspace,
              _pack: data.pack,
              _name: data.name,
              _entity: data.entity,
              _scope: data.scope,
              _buyer: data.buyer,
              _country: data.country,
            })
          : data.operation === "save"
            ? await db.rpc("save_procurement_requirement", {
                _id: data.id,
                _version: data.version,
                _changes: data.changes,
              })
            : data.operation === "review"
              ? await db.rpc("review_procurement_requirement", {
                  _id: data.id,
                  _version: data.version,
                  _decision: data.decision,
                  _reason: data.reason,
                })
              : await db.rpc("add_procurement_requirement", {
                  _assessment: data.assessment,
                  _template: data.template,
                });
      if (result.error) throw new Error(result.error.message);
      payload = { id: result.data };
    }
    const latest = await db.rpc("get_rrci_access", { _workspace: data.workspace });
    const [current] = latest.error ? [] : z.array(accessSchema).parse(latest.data);
    if (!current || current.subject !== context.userId || !current.permissions.includes(permission))
      throw new Error("Workspace access changed.");
    return { payload: JSON.stringify(payload) };
  });
