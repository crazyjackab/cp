import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, type RefObject } from "react";
import type { LibraryFile, MediaInfo } from "../types";
import { LibraryFileRow, type LibraryFileRowProps } from "./LibraryFileRow";

const FILE_ROW_GAP_PX = 6;
const FILE_ROW_ESTIMATE_PX = 76;

type RowHandlers = Omit<
  LibraryFileRowProps,
  "file" | "index" | "media" | "batchSelected" | "selectedPaths" | "selectionActive" | "selectionMode" | "onToggleSelect"
>;

interface Props extends RowHandlers {
  scrollRef: RefObject<HTMLElement | null>;
  files: LibraryFile[];
  mediaInfoMap: Record<string, MediaInfo>;
  selectedPaths: Set<string>;
  isSelected: (path: string) => boolean;
  selectionActive: boolean;
  selectionMode: boolean;
  onToggleSelect: (file: LibraryFile, index: number, shiftKey: boolean, ctrlKey: boolean) => void;
}

export function VirtualFileList({
  scrollRef,
  files,
  mediaInfoMap,
  selectedPaths,
  isSelected,
  selectionActive,
  selectionMode,
  onToggleSelect,
  ...rowHandlers
}: Props) {
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => FILE_ROW_ESTIMATE_PX + FILE_ROW_GAP_PX,
    overscan: 12,
    measureElement: (element) =>
      (element?.getBoundingClientRect().height ?? FILE_ROW_ESTIMATE_PX) + FILE_ROW_GAP_PX,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [files, virtualizer]);

  return (
    <div
      className="file-list virtual-file-list"
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        position: "relative",
        width: "100%",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const file = files[virtualRow.index];
        return (
          <div
            key={file.path}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="virtual-file-list-row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <LibraryFileRow
              file={file}
              index={virtualRow.index}
              media={mediaInfoMap[file.path]}
              batchSelected={isSelected(file.path)}
              selectedPaths={selectedPaths}
              selectionActive={selectionActive}
              selectionMode={selectionMode}
              onToggleSelect={(shiftKey, ctrlKey) =>
                onToggleSelect(file, virtualRow.index, shiftKey, ctrlKey)
              }
              {...rowHandlers}
            />
          </div>
        );
      })}
    </div>
  );
}
