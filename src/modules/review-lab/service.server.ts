import { createHash } from 'node:crypto';
import { prepareStudy, parseFindings, parseTranscript, createExperimentBacklog, studySchema } from './contract.ts';
import { sessionSchema, packSession, validateSessionParts, encodeReviewFile } from './session.ts';

type MembershipClient = { from: (table: string) => any };
export async function authoriseStudy(db: MembershipClient, userId: string, tenantId: string) {
  const result = await db.from('tenant_members').select('role')
    .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
  if (result.error || !['owner', 'admin', 'agent'].includes(result.data?.role))
    throw new Error('Review Lab requires owner, admin or agent membership');
}
export async function prepareReview(db: MembershipClient, userId: string, input: unknown) {
  const study = studySchema.parse(input);
  await authoriseStudy(db, userId, study.tenantId);
  const plan = prepareStudy(study);
  const digest = createHash('sha256').update(JSON.stringify(plan.study)).digest('hex');
  return { ...plan, digest };
}
export async function inspectReview(db: MembershipClient, userId: string, input: unknown, report: unknown) {
  const plan = await prepareReview(db, userId, input);
  return parseFindings(report, plan.digest, plan.study);
}
export async function inspectDiscussion(db: MembershipClient, userId: string, input: unknown, transcript: unknown) {
  const plan = await prepareReview(db, userId, input);
  return parseTranscript(transcript, plan.digest, plan.study);
}
export async function exportExperiments(db: MembershipClient, userId: string, input: unknown, report: unknown) {
  const plan = await prepareReview(db, userId, input);
  return createExperimentBacklog(report, plan.digest, plan.study);
}

export async function restoreSession(db: MembershipClient, userId: string, tenantId: string, input: unknown) {
  const session = sessionSchema.parse(input);
  encodeReviewFile(session);
  if (session.study.tenantId !== tenantId) throw new Error('Session belongs to another tenant');
  const plan = await prepareReview(db, userId, session.study);
  const parts = validateSessionParts(session, plan.digest);
  return { plan, ...parts };
}

export async function exportSession(db: MembershipClient, userId: string, tenantId: string, input: unknown) {
  const restored = await restoreSession(db, userId, tenantId, input);
  return packSession(restored.plan.study, restored.report, restored.transcript);
}
