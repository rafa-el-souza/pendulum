import { describe, expect, it } from "vitest";

import { cls } from "./css.ts";

describe("cls", () => {
  const module: CSSModuleClasses = { stage: "stage_a1b2" };

  it("gives the scoped name of a class the module has", () => {
    expect(cls(module, "stage")).toBe("stage_a1b2");
  });

  it("throws for a class the module lacks, instead of leaving the element unstyled", () => {
    expect(() => cls(module, "stgae")).toThrow(/stgae/);
  });
});
