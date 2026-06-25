#!/usr/bin/env node
/**
 * i18n locale key completeness check.
 *
 * Fails if a key exists in en.json but is missing in ar.json or fr.json.
 * Run as part of CI: node scripts/check-i18n.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(__dirname, "../src/i18n/locales");

function loadJson(file) {
  return JSON.parse(readFileSync(resolve(localesDir, file), "utf-8"));
}

function flatten(obj, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

const en = flatten(loadJson("en.json"));
const ar = flatten(loadJson("ar.json"));
const fr = flatten(loadJson("fr.json"));

const enKeys = new Set(Object.keys(en));
const arKeys = new Set(Object.keys(ar));
const frKeys = new Set(Object.keys(fr));

const missingAr = [...enKeys].filter((k) => !arKeys.has(k));
const missingFr = [...enKeys].filter((k) => !frKeys.has(k));

let failed = false;

if (missingAr.length > 0) {
  console.error(`\n❌ Missing ${missingAr.length} key(s) in ar.json (present in en.json):`);
  missingAr.forEach((k) => console.error(`   - ${k}`));
  failed = true;
}

if (missingFr.length > 0) {
  console.error(`\n❌ Missing ${missingFr.length} key(s) in fr.json (present in en.json):`);
  missingFr.forEach((k) => console.error(`   - ${k}`));
  failed = true;
}

if (failed) {
  console.error("\n💡 Add the missing translations to src/i18n/locales/{ar,fr}.json");
  process.exit(1);
}

console.log(`✅ All ${enKeys.size} en.json keys present in ar.json (${arKeys.size}) and fr.json (${frKeys.size})`);
