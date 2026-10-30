// Builds messages/xx.json, the placeholder "demo language", from messages/en.json.
// Pseudo-localisation: accented letters in brackets, ICU arguments left intact.
// Run after editing en.json: node scripts/pseudo-locale.mjs
import { readFileSync, writeFileSync } from "node:fs";

const MAP = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", c: "ç", n: "ñ" };

function pseudo(text) {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "{") depth++;
    if (depth === 0) out += MAP[ch] ?? ch;
    else out += ch;
    if (ch === "}") depth--;
  }
  return `⟦${out}⟧`;
}

const walk = (v) => (typeof v === "string" ? pseudo(v) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])));
const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url)));
writeFileSync(new URL("../messages/xx.json", import.meta.url), `${JSON.stringify(walk(en), null, 2)}\n`);
