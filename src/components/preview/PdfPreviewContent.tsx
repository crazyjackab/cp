import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import type { LibraryFile } from "../../types";
import { IconPdf } from "../icons";
import { reportError } from "../../utils/errors";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface Props {
  file: LibraryFile;
}

export function PdfPreviewContent({ file }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setPage(1);
    setPageCount(0);
    setPdfDoc(null);

    const url = convertFileSrc(file.path);
    pdfjsLib
      .getDocument(url)
      .promise.then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setPageCount(doc.numPages);
      })
      .catch((e) => {
        reportError("加载 PDF", e, { warnOnly: true });
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file.path]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    pdfDoc
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled) return;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const viewport = pdfPage.getViewport({ scale: 1 });
        const maxWidth = 860;
        const scale = Math.min(1.8, maxWidth / viewport.width);
        const scaled = pdfPage.getViewport({ scale });

        canvas.width = scaled.width;
        canvas.height = scaled.height;

        return pdfPage.render({ canvasContext: ctx, viewport: scaled }).promise;
      })
      .catch((e) => {
        reportError("渲染 PDF 页面", e, { warnOnly: true });
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, page]);

  useEffect(() => {
    return () => {
      void pdfDoc?.destroy();
    };
  }, [pdfDoc]);

  if (loading) {
    return <div className="file-preview-placeholder loading">加载 PDF…</div>;
  }
  if (failed || !pdfDoc) {
    return (
      <div className="file-preview-placeholder">
        <IconPdf size={48} />
        <p>无法预览 PDF</p>
        <p className="hint">请用系统默认程序打开</p>
      </div>
    );
  }

  return (
    <div className="file-preview-pdf-wrap">
      <canvas ref={canvasRef} className="file-preview-pdf-canvas" />
      {pageCount > 1 && (
        <div className="file-preview-pdf-toolbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="file-preview-pdf-page">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
