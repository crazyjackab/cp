import { useCallback, useMemo } from "react";
import { useAppToast, type ToastKind } from "../context/AppToastContext";

export function useOperationToast() {
  const { showToast, noteImportTask } = useAppToast();

  const toastSuccess = useCallback((message: string) => showToast(message, "success"), [showToast]);
  const toastError = useCallback((message: string) => showToast(message, "error"), [showToast]);
  const toastInfo = useCallback((message: string) => showToast(message, "info"), [showToast]);

  return useMemo(
    () => ({
      noteImportTask,
      toast: showToast,
      toastSuccess,
      toastError,
      toastInfo,
    }),
    [noteImportTask, showToast, toastSuccess, toastError, toastInfo],
  );
}

export type { ToastKind };
