// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "react-pdf-textkit-bidi-patch",
        enforce: "pre",
        transform(code, id) {
          if (id.includes("@react-pdf/textkit") && code.includes("if (addedGlyphs.has(glyph.id))")) {
            return {
              code: code.replace(
                "if (addedGlyphs.has(glyph.id))",
                "if (!glyph || addedGlyphs.has(glyph.id))"
              ),
              map: null,
            };
          }
        },
      },
      {
        name: "tanstack-server-fn-base-transform",
        enforce: "pre",
        apply: "serve",
        transform(code, id, options) {
          if (!options?.ssr && code.includes("process.env.TSS_SERVER_FN_BASE")) {
            return {
              code: code.replaceAll("process.env.TSS_SERVER_FN_BASE", JSON.stringify("/_serverFn/")),
              map: null,
            };
          }
        },
      },
    ],
  },
});
