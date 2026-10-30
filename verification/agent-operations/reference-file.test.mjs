import test from "node:test";
import assert from "node:assert/strict";
import {
  parseReferenceFile,
  requestReference,
} from "../../src/modules/agent-factory/reference-file.ts";
const tenantId = "11111111-1111-4111-8111-111111111111",
  requestId = "22222222-2222-4222-8222-222222222222";
const scope = { tenantId, productKey: "omniqora" };
const file = `Omniqora queue request reference\n\nRequest reference: ${requestId}\nWorkspace ID: ${tenantId}\nProduct: omniqora\n\nLookup instructions`;
test("imports saved coordinates with LF, CRLF and BOM", () => {
  for (const text of [file, file.replaceAll("\n", "\r\n"), "\uFEFF" + file])
    assert.equal(parseReferenceFile(text, scope), requestId);
});
test("rejects foreign workspace or product", () => {
  assert.throws(
    () => parseReferenceFile(file, { ...scope, tenantId: requestId }),
    /different workspace/,
  );
  assert.throws(
    () => parseReferenceFile(file, { ...scope, productKey: "dishbee" }),
    /different workspace/,
  );
});
test("rejects duplicate, missing and malformed identifiers", () => {
  assert.throws(
    () => parseReferenceFile(file + "\nRequest reference: " + requestId, scope),
    /duplicate/,
  );
  assert.throws(
    () => parseReferenceFile(file.replace("Workspace ID:", "Other:"), scope),
    /missing/,
  );
  assert.throws(
    () => parseReferenceFile(file.replace(requestId, "x".repeat(36)), scope),
    /invalid/,
  );
  assert.equal(requestReference.safeParse("x".repeat(36)).success, false);
});
test("rejects oversized files and unrelated text", () => {
  assert.throws(() => parseReferenceFile(file + "x".repeat(8192), scope), /too large/);
  assert.throws(() => parseReferenceFile("another file", scope), /Choose/);
});
