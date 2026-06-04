import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isPointerOutsideWindow,
  startNativeFileDrag,
} from "../utils/nativeFileDrag";
import { resolveDropTargetFromClientPoint, type ImportDropTarget } from "../utils/importTarget";

interface SessionOptions {
  onHoverChange?: (target: ImportDropTarget | null) => void;
  onDrop?: (paths: string[], target: ImportDropTarget) => void;
}

interface InternalFileDragContextValue {
  dragging: boolean;
  startDrag: (paths: string[], event: React.PointerEvent) => void;
}

const InternalFileDragContext = createContext<InternalFileDragContextValue | null>(null);

export function useInternalFileDragStart(): Pick<InternalFileDragContextValue, "startDrag"> {
  const ctx = useContext(InternalFileDragContext);
  if (!ctx) {
    throw new Error("useInternalFileDragStart must be used within InternalFileDragProvider");
  }
  return ctx;
}

export function useInternalFileDragging(): boolean {
  const ctx = useContext(InternalFileDragContext);
  return ctx?.dragging ?? false;
}

interface ProviderProps extends SessionOptions {
  children: ReactNode;
}

export function InternalFileDragProvider({ children, onHoverChange, onDrop }: ProviderProps) {
  const [dragging, setDragging] = useState(false);
  const pathsRef = useRef<string[]>([]);
  const nativeDragStartedRef = useRef(false);
  const captureRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const onHoverChangeRef = useRef(onHoverChange);
  const onDropRef = useRef(onDrop);
  onHoverChangeRef.current = onHoverChange;
  onDropRef.current = onDrop;

  const endSession = useCallback(() => {
    const capture = captureRef.current;
    if (capture?.element.hasPointerCapture(capture.pointerId)) {
      capture.element.releasePointerCapture(capture.pointerId);
    }
    captureRef.current = null;
    pathsRef.current = [];
    nativeDragStartedRef.current = false;
    setDragging(false);
    onHoverChangeRef.current?.(null);
  }, []);

  const startDrag = useCallback((paths: string[], event: React.PointerEvent) => {
    if (paths.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    pathsRef.current = paths;
    nativeDragStartedRef.current = false;
    setDragging(true);
    const element = event.currentTarget;
    if (element instanceof HTMLElement) {
      captureRef.current = { element, pointerId: event.pointerId };
      element.setPointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const paths = pathsRef.current;
      if (
        paths.length > 0 &&
        !nativeDragStartedRef.current &&
        isPointerOutsideWindow(event.clientX, event.clientY)
      ) {
        nativeDragStartedRef.current = true;
        endSession();
        void startNativeFileDrag(paths);
        return;
      }
      onHoverChangeRef.current?.(resolveDropTargetFromClientPoint(event.clientX, event.clientY));
    };

    const onPointerUp = (event: PointerEvent) => {
      const paths = pathsRef.current;
      const target = resolveDropTargetFromClientPoint(event.clientX, event.clientY);
      endSession();
      if (target && paths.length > 0) {
        onDropRef.current?.(paths, target);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        endSession();
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dragging, endSession]);

  return (
    <InternalFileDragContext.Provider value={{ dragging, startDrag }}>
      {children}
    </InternalFileDragContext.Provider>
  );
}
