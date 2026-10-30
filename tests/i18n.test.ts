import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/api";
import { canApproveLanguage, canEditLanguage, catalog, messageArgs, normaliseLanguageCode, validateTranslation } from "@/lib/i18n";

describe("messageArgs", () => {
  it("finds arguments, including inside plural branches", () => {
    expect(messageArgs("{count, plural, one {# Elder in {group}} other {# Elders}}")).toEqual(["count", "group"]);
    expect(messageArgs("Hello, {name}")).toEqual(["name"]);
    expect(messageArgs("No arguments")).toEqual([]);
  });
});

describe("validateTranslation", () => {
  // elder.membersCount is "{count} members" in en.json.
  it("accepts a translation that keeps the same arguments", () => {
    expect(validateTranslation("elder.membersCount", "{count} mob")).toBeNull();
  });

  it("rejects a translation that drops an argument", () => {
    expect(validateTranslation("elder.membersCount", "members")).toMatch(/Keep \{count\}/);
  });

  it("rejects an argument the English doesn't have", () => {
    expect(validateTranslation("elder.membersCount", "{count} {people}")).toMatch(/\{people\} isn't in the English/);
  });

  it("rejects unreadable ICU", () => {
    expect(validateTranslation("elder.membersCount", "{count members")).toMatch(/curly brackets/);
  });

  it("rejects unknown keys and empty text", () => {
    expect(validateTranslation("nope.key", "x")).toBe("Unknown string");
    expect(validateTranslation("elder.approve", "   ")).toBe("Translation is empty");
  });

  it("can validate every English string against itself", () => {
    for (const e of catalog()) expect(validateTranslation(e.key, e.source), e.key).toBeNull();
  });
});

describe("normaliseLanguageCode", () => {
  it("accepts ISO 639-3 codes, regions and the local-use range", () => {
    expect(normaliseLanguageCode("abc")).toBe("abc");
    expect(normaliseLanguageCode("ABC-au")).toBe("abc-AU");
    expect(normaliseLanguageCode("qaa")).toBe("qaa");
  });

  it("rejects English, free text and malformed tags", () => {
    expect(normaliseLanguageCode("en")).toBeNull();
    expect(normaliseLanguageCode("My language")).toBeNull();
    expect(normaliseLanguageCode("x-demo")).toBeNull();
  });
});

describe("language permissions", () => {
  const language = { communityId: "salt" };
  const person = (opts: { elderOf?: string[]; custodianOf?: string[] }) =>
    ({
      elderGroupIds: new Set(opts.elderOf ?? []),
      user: { memberships: (opts.custodianOf ?? []).map((groupId) => ({ groupId, canTranslate: true })) },
    }) as unknown as Actor;

  it("lets the owning community's Elders edit and approve", () => {
    const elder = person({ elderOf: ["salt"] });
    expect(canEditLanguage(elder, language)).toBe(true);
    expect(canApproveLanguage(elder, language)).toBe(true);
  });

  it("lets custodians draft but not approve", () => {
    const custodian = person({ custodianOf: ["salt"] });
    expect(canEditLanguage(custodian, language)).toBe(true);
    expect(canApproveLanguage(custodian, language)).toBe(false);
  });

  it("gives another community's Elders no access", () => {
    const other = person({ elderOf: ["iron"], custodianOf: ["iron"] });
    expect(canEditLanguage(other, language)).toBe(false);
    expect(canApproveLanguage(other, language)).toBe(false);
  });
});

describe("iOS app strings", () => {
  const appEntry = () => catalog().find((e) => e.format === "printf" && e.args.length >= 2);

  it("are part of the catalog under the app section", () => {
    expect(catalog().some((e) => e.namespace === "app" && e.key.startsWith("app:"))).toBe(true);
  });

  it("must keep the same printf placeholders, in any order", () => {
    const e = appEntry()!;
    expect(validateTranslation(e.key, e.source)).toBeNull();
    // Positional specifiers let a translation reorder arguments.
    const reordered = e.args.map((a, i) => a.replace("%", `%${e.args.length - i}$`)).join(" ");
    expect(validateTranslation(e.key, reordered)).toBeNull();
    expect(validateTranslation(e.key, "no placeholders")).toMatch(/Keep the placeholders/);
  });
});
