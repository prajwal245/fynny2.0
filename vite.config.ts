// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// On Vercel, document reading (OCR + AI) can take longer than the default
// function timeout. Other presets ignore this. (Cast, because the
// wrapper's types list only a few nitro keys; nitro accepts all of them.)
type NitroOption = NonNullable<Parameters<typeof defineConfig>[0]>["nitro"];
// Server functions run in Sydney (syd1), next to the Supabase database
// (ap-southeast-2): each database call is a few milliseconds instead of a
// trans-Pacific round trip.
const nitro = { vercel: { regions: ["syd1"], functions: { maxDuration: 60, regions: ["syd1"] } } } as unknown as NitroOption;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro,
});
