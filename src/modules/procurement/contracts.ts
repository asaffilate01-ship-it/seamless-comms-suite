import { z } from "zod";

export type RequirementTemplate = {
  key: string;
  title: string;
  category: string;
  kind: "readiness" | "registration" | "certification" | "buyer_decision";
  applies_when: string;
  guidance: string;
  evidence: string;
  source_url: string;
  mandatory?: boolean;
};
export type Pack = {
  id: string;
  version: string;
  title: string;
  description: string;
  caution: string;
  source_checked_on: string;
  requirements: RequirementTemplate[];
};
export type Assessment = {
  id: string;
  workspace_id: string;
  pack_id: string;
  pack_version: string;
  name: string;
  legal_entity: string;
  scope: string;
  buyer: string;
  country: string;
  created_at: string;
};
export type Requirement = {
  id: string;
  assessment_id: string;
  workspace_id: string;
  template: RequirementTemplate;
  status: "not_started" | "in_progress" | "evidence_ready" | "reviewed" | "not_applicable";
  owner_name: string;
  due_date: string | null;
  evidence_title: string;
  evidence_url: string;
  issuer: string;
  reference: string;
  valid_until: string | null;
  notes: string;
  review_reason: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  version: number;
};
export type AuditEvent = {
  id: number;
  assessment_id: string;
  actor: string;
  action: string;
  created_at: string;
  detail: Record<string, unknown>;
};
export type Snapshot = {
  assessments: Assessment[];
  requirements: Requirement[];
  audit: AuditEvent[];
};

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
export const evidenceUrl = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(1500)
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }, "Use an HTTPS evidence link without credentials."),
]);
export const editSchema = z
  .object({
    status: z.enum(["not_started", "in_progress", "evidence_ready"]),
    owner_name: z.string().trim().max(120),
    due_date: date,
    evidence_title: z.string().trim().max(200),
    evidence_url: evidenceUrl,
    issuer: z.string().trim().max(200),
    reference: z.string().trim().max(200),
    valid_until: date,
    notes: z.string().trim().max(4000),
  })
  .strict();
export type RequirementEdit = z.infer<typeof editSchema>;
export const customTemplateSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    kind: z.enum(["readiness", "registration", "certification", "buyer_decision"]),
    applies_when: z.string().trim().min(3).max(1000),
    guidance: z.string().trim().min(3).max(2000),
    evidence: z.string().trim().min(3).max(1000),
    source_url: evidenceUrl.refine((value) => value.length > 0, "A source is required."),
  })
  .strict();
