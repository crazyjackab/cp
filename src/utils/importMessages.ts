import type { ImportResult } from "../types";
import { formatPolicySkipSummary } from "./importSkip";

function formatSkippedDetail(result: ImportResult): string {
  const policy = result.skipped_items ?? [];
  if (policy.length === 0) {
    return result.skipped_count > 0 ? "同名或冲突" : "";
  }
  return formatPolicySkipSummary(policy);
}

export function formatImportResultMessage(result: ImportResult, sourceLabel = ""): string {
  const prefix = sourceLabel ? `${sourceLabel}` : "";
  const fail = result.failed.length;
  const skipped = result.skipped_count ?? 0;
  const skipDetail = formatSkippedDetail(result);

  if (fail > 0) {
    const firstReason = result.failed[0]?.reason?.trim();
    const reasonHint = firstReason ? `：${firstReason}` : "";
    const skipHint = skipped > 0 ? `，跳过 ${skipped} 个${skipDetail ? `（${skipDetail}）` : ""}` : "";
    return `${prefix}已收纳 ${result.moved_count} 个${skipHint}，${fail} 个失败${reasonHint}`;
  }
  if (skipped > 0) {
    const detail = skipDetail ? `（${skipDetail}）` : "";
    return `${prefix}已收纳 ${result.moved_count} 个，跳过 ${skipped} 个${detail}`;
  }
  return `${prefix}已收纳 ${result.moved_count} 个文件`;
}

export function formatImportNotificationTitle(sourceLabel?: string): string {
  if (sourceLabel) {
    return `File Manager ${sourceLabel}收纳完成`;
  }
  return "File Manager 收纳完成";
}

export function formatImportNotificationBody(result: ImportResult): string {
  const fail = result.failed.length;
  const skipped = result.skipped_count ?? 0;
  const skipDetail = formatSkippedDetail(result);
  const detail = skipDetail ? `（${skipDetail}）` : "";

  if (fail > 0) {
    return `已收纳 ${result.moved_count} 个，跳过 ${skipped} 个${detail}，${fail} 个失败。`;
  }
  if (skipped > 0) {
    return `已收纳 ${result.moved_count} 个，跳过 ${skipped} 个${detail}。`;
  }
  return `已收纳 ${result.moved_count} 个文件。`;
}
