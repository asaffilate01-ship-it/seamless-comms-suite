import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("./", import.meta.url));
const source = fileURLToPath(new URL("../../src", import.meta.url));
const outDir = path.resolve(process.argv[2] || "/workspace/scratch/ff4073d93081/growth-ui-preview");
await build({
  configFile: false,
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": source } },
  build: { outDir, emptyOutDir: true, rolldownOptions: { output: { inlineDynamicImports: true } } },
  logLevel: "warn",
});
let html = await readFile(path.join(outDir, "index.html"), "utf8");
for (const file of await readdir(path.join(outDir, "assets"))) {
  const contents = await readFile(path.join(outDir, "assets", file), "utf8");
  if (file.endsWith(".js"))
    html = html.replace(
      /<script[^>]*src="[^"]+"[^>]*><\/script>/,
      `<script type="module">${contents.replaceAll("</script", "<\\/script")}</script>`,
    );
  if (file.endsWith(".css"))
    html = html.replace(
      /<link[^>]*rel="stylesheet"[^>]*>/,
      `<style>${contents.replaceAll("</style", "<\\/style")}</style>`,
    );
}
await writeFile(path.join(outDir, "render.html"), html);
const harness = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growth desktop and mobile verification</title><style>body{margin:0;background:#e9edf5;font:14px system-ui;color:#182136}header{padding:14px 24px;display:flex;align-items:center;gap:12px;background:white;border-bottom:1px solid #cbd5e1}button{border:1px solid #cbd5e1;background:white;border-radius:6px;padding:8px 14px;cursor:pointer}iframe{display:block;background:white;margin:20px auto;border:1px solid #cbd5e1;border-radius:12px;width:min(1180px,calc(100vw - 32px));height:850px;transition:width .2s}</style></head><body><header><strong>UI verification · sample data</strong><button id="desktop">Desktop 1180 px</button><button id="mobile">Mobile 390 px</button></header><iframe title="Growth setup preview" src="./render.html"></iframe><script>const frame=document.querySelector('iframe');document.getElementById('desktop').onclick=()=>frame.style.width='min(1180px,calc(100vw - 32px))';document.getElementById('mobile').onclick=()=>frame.style.width='390px';</script></body></html>`;
await writeFile(path.join(outDir, "index.html"), harness);
console.log(`Visual verification fixture: ${path.join(outDir, "index.html")}`);
