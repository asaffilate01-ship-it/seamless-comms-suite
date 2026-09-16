import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines product metadata", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /Omniqora Control by iTechLounge/);
  assert.match(layout, /codex-preview/);
  assert.match(layout, /Private intelligence control plane and client add-on platform/);
});
