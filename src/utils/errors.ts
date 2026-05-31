/**
 * 统一错误格式化与上报：区分可忽略的取消失败、次要加载失败与用户应感知的错误。
 */

export function formatError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export type ReportErrorOptions = {
  /** 仅开发环境输出 debug（如取消已结束的后台任务） */
  silent?: boolean;
  /** 控制台 warn，不弹 toast（标签列表、版本号等次要数据） */
  warnOnly?: boolean;
  /** 向用户展示错误 toast */
  toast?: (message: string) => void;
};

export function reportError(context: string, error: unknown, options?: ReportErrorOptions): void {
  const detail = formatError(error);
  const message = detail ? `${context}：${detail}` : context;

  if (options?.toast) {
    options.toast(message);
    console.error(`[${context}]`, detail || context);
    return;
  }

  if (options?.silent) {
    if (import.meta.env.DEV) {
      console.debug(`[${context}]`, detail || "(no detail)");
    }
    return;
  }

  if (options?.warnOnly) {
    console.warn(`[${context}]`, detail || context);
    return;
  }

  console.error(`[${context}]`, detail || context);
}

/** 用户可见错误：toast + console.error */
export function reportToastError(
  toastError: (message: string) => void,
  context: string,
  error: unknown,
): void {
  reportError(context, error, { toast: toastError });
}
