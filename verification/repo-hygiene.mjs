import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

await assert.rejects(() => access(new URL("../.env", import.meta.url)), {
  code: "ENOENT",
});

const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
assert.match(gitignore, /(^|\n)\.env(\n|$)/);
assert.match(gitignore, /(^|\n)\.env\.\*(\n|$)/);
assert.match(gitignore, /!\.env\.example/);

console.log("repository environment-file hygiene verified");
