import { z } from 'zod';
import { studySchema, findingsSchema, transcriptSchema, parseFindings, parseTranscript, type Study } from './contract.ts';

export const MAX_REVIEW_FILE_BYTES = 4 * 1024 * 1024;
export function parseReviewFile(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_REVIEW_FILE_BYTES)
    throw new Error('Review files must be at most 4 MiB');
  return JSON.parse(text) as unknown;
}

export const sessionSchema = z.object({
  format: z.literal('omniqora-review-session'), version: z.literal(1),
  study: studySchema,
  report: findingsSchema.nullable(), transcript: transcriptSchema.nullable(),
}).strict();
export type ReviewSession = z.infer<typeof sessionSchema>;

// Include data only. Imported files cannot carry execution rights or provider configuration.
export function packSession(study: Study, report: z.infer<typeof findingsSchema> | null,
  transcript: z.infer<typeof transcriptSchema> | null): ReviewSession {
  return sessionSchema.parse({ format: 'omniqora-review-session', version: 1, study,
    report: report ? {version: report.version, studyDigest: report.studyDigest, findings: report.findings} : null,
    transcript: transcript ? {version: transcript.version, studyDigest: transcript.studyDigest, messages: transcript.messages} : null,
  });
}

export function validateSessionParts(session: ReviewSession, digest: string) {
  return {
    report: session.report ? parseFindings(session.report, digest, session.study) : null,
    transcript: session.transcript ? parseTranscript(session.transcript, digest, session.study) : null,
  };
}

// Same encoding and size rules as file import, including Unicode and indentation.
export function encodeReviewFile(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_REVIEW_FILE_BYTES)
    throw new Error('Review file exceeds the 4 MiB limit');
  return text;
}
