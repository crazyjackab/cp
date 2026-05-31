import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PhysicalPosition } from "@tauri-apps/api/dpi";

export interface ExternalDropPayload {
  paths: string[];
  clientX: number;
  clientY: number;
}

export interface ExternalDragPoint {
  clientX: number;
  clientY: number;
}

async function physicalToClientPoint(
  position: PhysicalPosition,
): Promise<{ clientX: number; clientY: number }> {
  const factor = await getCurrentWindow().scaleFactor();
  return { clientX: position.x / factor, clientY: position.y / factor };
}

export function useDragDropImport(
  onDrop: (payload: ExternalDropPayload) => void,
  onPositionChange?: (point: ExternalDragPoint | null) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  const onPositionChangeRef = useRef(onPositionChange);
  onDropRef.current = onDrop;
  onPositionChangeRef.current = onPositionChange;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onDragDropEvent(async (event) => {
        const payload = event.payload;
        if (payload.type === "over" || payload.type === "enter") {
          setIsDragging(true);
          const point = await physicalToClientPoint(payload.position);
          onPositionChangeRef.current?.(point);
          return;
        }
        if (payload.type === "drop") {
          setIsDragging(false);
          if (payload.paths.length === 0) {
            onPositionChangeRef.current?.(null);
            return;
          }
          const point = await physicalToClientPoint(payload.position);
          onDropRef.current({
            paths: payload.paths,
            clientX: point.clientX,
            clientY: point.clientY,
          });
          onPositionChangeRef.current?.(null);
          return;
        }
        setIsDragging(false);
        onPositionChangeRef.current?.(null);
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        /* 非 Tauri 环境（如浏览器预览）忽略 */
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return { isDragging };
}
