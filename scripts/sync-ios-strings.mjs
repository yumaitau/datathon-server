// Copies the iOS app's translatable strings into messages/app.en.json so
// communities can translate the app alongside the web portals.
// Usage: node scripts/sync-ios-strings.mjs [path/to/Localizable.xcstrings]
// (default: ../app/DatathonApp/DatathonApp/Localizable.xcstrings)
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? new URL("../../app/DatathonApp/DatathonApp/Localizable.xcstrings", import.meta.url);
const catalog = JSON.parse(readFileSync(path, "utf8"));
const out = {};
for (const [key, entry] of Object.entries(catalog.strings)) {
  if (entry.shouldTranslate === false || !key.trim()) continue;
  // Xcode keys are the source text; an explicit English value wins (e.g. positional specifiers).
  out[key] = entry.localizations?.en?.stringUnit?.value ?? key;
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL("../messages/app.en.json", import.meta.url), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} iOS strings written to messages/app.en.json`);
