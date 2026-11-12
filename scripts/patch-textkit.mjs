import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const textkitPath = path.resolve(__dirname, "../node_modules/@react-pdf/textkit/lib/textkit.js");

if (fs.existsSync(textkitPath)) {
  const content = fs.readFileSync(textkitPath, "utf8");
  const unpatched = "if (addedGlyphs.has(glyph.id))";
  const patched = "if (!glyph || addedGlyphs.has(glyph.id))";

  if (content.includes(unpatched) && !content.includes(patched)) {
    const next = content.replace(unpatched, patched);
    fs.writeFileSync(textkitPath, next, "utf8");
    console.log("[patch-textkit] Successfully patched @react-pdf/textkit for safe Arabic bidi layout.");
  } else if (content.includes(patched)) {
    console.log("[patch-textkit] @react-pdf/textkit is already patched.");
  }
}
