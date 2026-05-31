import { useCallback, useRef, useState } from "react";

export function useFileSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchorIndexRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorIndexRef.current = null;
  }, []);

  const isSelected = useCallback((path: string) => selected.has(path), [selected]);

  const selectAll = useCallback((paths: string[]) => {
    setSelected(new Set(paths));
    anchorIndexRef.current = paths.length > 0 ? 0 : null;
  }, []);

  const invert = useCallback((paths: string[]) => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const p of paths) {
        if (!prev.has(p)) next.add(p);
      }
      return next;
    });
  }, []);

  const toggleOne = useCallback((path: string, index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    anchorIndexRef.current = index;
  }, []);

  const selectRange = useCallback((paths: string[], from: number, to: number) => {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        if (paths[i]) next.add(paths[i]);
      }
      return next;
    });
    anchorIndexRef.current = to;
  }, []);

  const handleSelect = useCallback(
    (paths: string[], path: string, index: number, shiftKey: boolean, ctrlOrMeta: boolean) => {
      if (shiftKey && anchorIndexRef.current !== null) {
        selectRange(paths, anchorIndexRef.current, index);
        return;
      }
      if (ctrlOrMeta) {
        toggleOne(path, index);
        return;
      }
      setSelected(new Set([path]));
      anchorIndexRef.current = index;
    },
    [selectRange, toggleOne],
  );

  const selectedPaths = useCallback(() => Array.from(selected), [selected]);

  return {
    selected,
    selectedCount: selected.size,
    isSelected,
    selectAll,
    invert,
    toggleOne,
    handleSelect,
    clear,
    selectedPaths,
  };
}
