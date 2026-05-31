import type { SkippedImportFile, SkippedImportItem } from "../types";

export function summarizeSkipReasons(
  skipped: Array<SkippedImportFile | SkippedImportItem>,
): string {
  if (skipped.length === 0) return "";

  const groups = new Map<string, number>();
  for (const item of skipped) {
    groups.set(item.reason, (groups.get(item.reason) ?? 0) + 1);
  }

  return [...groups.entries()]
    .map(([reason, count]) => `${count} 个${reason}`)
    .join("，");
}

export function formatPolicySkipSummary(
  skipped: Array<SkippedImportFile | SkippedImportItem>,
): string {
  if (skipped.length === 0) return "";
  return summarizeSkipReasons(skipped);
}
