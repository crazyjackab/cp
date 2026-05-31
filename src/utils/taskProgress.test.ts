import { describe, expect, it } from "vitest";
import type { BackgroundTaskEvent } from "../types";
import {
  createFinishedTaskRegistry,
  isBackgroundTaskRunning,
  isIndeterminateProgress,
  resolveProgressPercent,
  resolveProgressRatio,
} from "./taskProgress";

describe("createFinishedTaskRegistry", () => {
  it("marks and consumes finished task ids", () => {
    const registry = createFinishedTaskRegistry();
    expect(registry.consumeIfAlreadyFinished("t1")).toBe(false);
    registry.markFinished("t1");
    expect(registry.consumeIfAlreadyFinished("t1")).toBe(true);
    expect(registry.consumeIfAlreadyFinished("t1")).toBe(false);
  });
});

describe("isBackgroundTaskRunning", () => {
  const running: BackgroundTaskEvent = {
    task_id: "a",
    kind: "import",
    status: "running",
    message: "",
    processed: 1,
    total: 10,
    progress: null,
    result: null,
  };

  it("returns false when task id is null", () => {
    expect(isBackgroundTaskRunning(null, running)).toBe(false);
  });

  it("returns true when task started but no event yet", () => {
    expect(isBackgroundTaskRunning("a", null)).toBe(true);
    expect(isBackgroundTaskRunning("a", undefined)).toBe(true);
  });

  it("returns false when event for same task is terminal", () => {
    expect(isBackgroundTaskRunning("a", { ...running, status: "completed" })).toBe(false);
    expect(isBackgroundTaskRunning("a", { ...running, status: "failed" })).toBe(false);
    expect(isBackgroundTaskRunning("a", { ...running, status: "cancelled" })).toBe(false);
  });

  it("ignores events for other tasks", () => {
    expect(isBackgroundTaskRunning("a", { ...running, task_id: "b" })).toBe(true);
  });
});

describe("resolveProgressRatio", () => {
  it("prefers explicit progress when finite", () => {
    expect(resolveProgressRatio(0, 100, 0.42)).toBe(0.42);
    expect(resolveProgressRatio(5, 10, 1.5)).toBe(1);
    expect(resolveProgressRatio(5, 10, -0.2)).toBe(0);
  });

  it("falls back to processed/total", () => {
    expect(resolveProgressRatio(25, 100)).toBe(0.25);
    expect(resolveProgressRatio(150, 100)).toBe(1);
  });

  it("returns null when ratio cannot be determined", () => {
    expect(resolveProgressRatio(0, 0)).toBeNull();
    expect(resolveProgressRatio(3, null)).toBeNull();
    expect(resolveProgressRatio(3, undefined, null)).toBeNull();
  });
});

describe("resolveProgressPercent", () => {
  it("rounds ratio to percent", () => {
    expect(resolveProgressPercent(1, 3)).toBe(33);
    expect(resolveProgressPercent(0, null, 0.5)).toBe(50);
    expect(resolveProgressPercent(0, 0)).toBeNull();
  });
});

describe("isIndeterminateProgress", () => {
  it("matches null ratio", () => {
    expect(isIndeterminateProgress(0, 0)).toBe(true);
    expect(isIndeterminateProgress(5, 10)).toBe(false);
    expect(isIndeterminateProgress(0, null, 0.1)).toBe(false);
  });
});
