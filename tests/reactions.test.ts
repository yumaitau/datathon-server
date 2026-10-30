import { expect, it } from "vitest";
import { reactionInput } from "@/lib/mutations";

it("accepts new reactions on posts and comments, including explicit offline state", () => {
  for (const targetType of ["post", "comment"]) {
    for (const kind of ["deadly", "aboriginal_flag"]) {
      expect(reactionInput.parse({ targetType, targetId: "target", kind, active: true })).toEqual({
        targetType, targetId: "target", kind, active: true,
      });
    }
  }
});
