import { describe, expect, it } from "vitest";
import { askAunty, auntyPersona, isCrisis, splitHandoff } from "@/lib/aunty";

describe("crisis screening", () => {
  it("catches the ways people actually say it", () => {
    for (const line of [
      "i want to kill myself",
      "been thinking about ending it",
      "i feel suicidal",
      "sometimes i just want to die",
      "i've been hurting myself again",
      "there's no reason to live any more",
    ]) {
      expect(isCrisis(line), line).toBe(true);
    }
  });

  it("leaves ordinary talk alone", () => {
    for (const line of [
      "my knee is killing me",
      "that hill nearly ended me",
      "the footy died in the second half",
      "i'm dead tired",
    ]) {
      expect(isCrisis(line), line).toBe(false);
    }
  });

  it("answers a crisis without calling the model and hands over", async () => {
    // No Cloudflare credentials are set in tests, so a model call would fall
    // through to the canned reply. The crisis path must not depend on either.
    const reply = await askAunty("i want to kill myself", [], null, "Jordan");
    expect(reply.handoff).toBe("crisis");
    expect(reply.mocked).toBe(false);
    expect(reply.body).toContain("13 92 76");
  });
});

describe("handoff markers", () => {
  it("strips the marker and reports the kind", () => {
    expect(splitHandoff("Go and see the clinic, bub.\n[[handoff:health]]")).toEqual({
      body: "Go and see the clinic, bub.",
      handoff: "health",
    });
  });

  it("returns the reply untouched when there is no marker", () => {
    expect(splitHandoff("No worries, my girl.")).toEqual({
      body: "No worries, my girl.",
      handoff: null,
    });
  });

  it("ignores a marker that is not one of ours", () => {
    const out = splitHandoff("Have a yarn. [[handoff:banking]]");
    expect(out.handoff).toBeNull();
    expect(out.body).toContain("[[handoff:banking]]");
  });
});

describe("persona", () => {
  it("puts the Elders' brief last so it outranks the defaults", () => {
    const prompt = auntyPersona("Send anyone asking about funerals to Uncle Tom.", "Leah");
    expect(prompt).toContain("Leah");
    expect(prompt.indexOf("The Elders of this community have told you:")).toBeGreaterThan(
      prompt.indexOf("When to step back:"),
    );
    expect(prompt.trimEnd().endsWith("Send anyone asking about funerals to Uncle Tom.")).toBe(true);
  });

  it("omits the Elder section when they have written nothing", () => {
    expect(auntyPersona(null, "Leah")).not.toContain("The Elders of this community have told you:");
    expect(auntyPersona("   ", "Leah")).not.toContain("The Elders of this community have told you:");
  });
});

describe("fallback when no model is configured", () => {
  it("still answers, marked as mocked, and routes health to the clinic", async () => {
    const reply = await askAunty("my sugar test came back high", [], null, "Leah");
    expect(reply.mocked).toBe(true);
    expect(reply.handoff).toBe("health");
    expect(reply.body.length).toBeGreaterThan(0);
  });

  it("sends culture questions back to the Elders", async () => {
    const reply = await askAunty("what's my skin name", [], null, "Jordan");
    expect(reply.handoff).toBe("elder");
  });
});
