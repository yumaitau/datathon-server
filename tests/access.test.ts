import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/api";
import { normalisePhone } from "@/lib/auth";
import { canSeePost, canSeeRestricted } from "@/lib/content";
import { CommunityScopeError, scopedDb } from "@/lib/db";

const actor = (gender: "female" | "male" | null, age: number | null, id = "u1") =>
  ({ user: { id, gender }, age }) as unknown as Actor;

describe("cultural restrictions", () => {
  const womensPost = { restrictGender: "female" as const, minAge: null };
  const adultsPost = { restrictGender: null, minAge: 18 };

  it("shows gender-restricted posts only to matching members", () => {
    expect(canSeeRestricted(actor("female", 30), womensPost)).toBe(true);
    expect(canSeeRestricted(actor("male", 30), womensPost)).toBe(false);
    expect(canSeeRestricted(actor(null, 30), womensPost)).toBe(false);
  });

  it("hides age-restricted posts from minors and unknown ages", () => {
    expect(canSeeRestricted(actor("male", 17), adultsPost)).toBe(false);
    expect(canSeeRestricted(actor("male", null), adultsPost)).toBe(false);
    expect(canSeeRestricted(actor("male", 18), adultsPost)).toBe(true);
  });

  it("lets Elders moderating the group see restricted and pending posts", () => {
    const pending = { status: "pending" as const, authorId: "someone", groupId: "g1", ...womensPost };
    expect(canSeePost(actor("male", 60), pending, new Set(["g1"]))).toBe(true);
    expect(canSeePost(actor("female", 30), pending, new Set())).toBe(false);
  });

  it("lets authors see their own pending post", () => {
    const own = { status: "pending" as const, authorId: "u1", groupId: "g1", restrictGender: null, minAge: null };
    expect(canSeePost(actor("male", 30, "u1"), own, new Set())).toBe(true);
  });
});

describe("normalisePhone", () => {
  it("accepts common Australian formats", () => {
    expect(normalisePhone("0400 000 001")).toBe("+61400000001");
    expect(normalisePhone("61400000001")).toBe("+61400000001");
    expect(normalisePhone("+61 400 000 001")).toBe("+61400000001");
  });
});

describe("community scoping", () => {
  it("refuses to create content in a community the caller doesn't belong to", async () => {
    const db = scopedDb(["community-a"]);
    // Rejected before any query is sent, so no database is needed.
    await expect(
      db.post.create({ data: { communityId: "community-b", groupId: "g", authorId: "u", body: "x" } }),
    ).rejects.toBeInstanceOf(CommunityScopeError);
  });
});
