// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Public browser client config for the connected Lovable Cloud project.
// .env is git-ignored (CI hygiene rule), so publish builds from the repository
// would otherwise ship without it. Only the project URL and the publishable
// (anon) key belong here — never a service-role or secret key.
// Values from the real environment still take precedence.
const PUBLIC_SUPABASE_URL = "https://mqbmbzsadypjzirbfhja.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ANczH4A73Jo_Zs0tadn6FQ_RjRgIO51";
process.env.VITE_SUPABASE_URL ||= PUBLIC_SUPABASE_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env.VITE_SUPABASE_PROJECT_ID ||= "mqbmbzsadypjzirbfhja";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
