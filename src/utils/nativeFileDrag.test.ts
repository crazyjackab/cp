import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPointerOutsideWindow } from "./nativeFileDrag";

describe("isPointerOutsideWindow", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      innerWidth: 800,
      innerHeight: 600,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when pointer is outside viewport edges", () => {
    expect(isPointerOutsideWindow(0, 10)).toBe(true);
    expect(isPointerOutsideWindow(10, 0)).toBe(true);
    expect(isPointerOutsideWindow(800, 10)).toBe(true);
    expect(isPointerOutsideWindow(10, 600)).toBe(true);
  });

  it("returns false when pointer is inside viewport", () => {
    expect(isPointerOutsideWindow(100, 100)).toBe(false);
    expect(isPointerOutsideWindow(798, 598)).toBe(false);
  });
});
