import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Download, X } from "lucide-react";

// Android Chrome doesn't render PDFs inside an <iframe> at all, and iOS
// Safari's iframe PDF view doesn't scroll reliably - rendering pages with
// pdf.js onto canvases sidesteps both platform quirks.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfViewerSheet({
  uri,
  title,
  onClose,
}: {
  uri: string;
  title: string;
  onClose: () => void;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [pageWidth, setPageWidth] = useState<number>(
    Math.min(window.innerWidth - 32, 700),
  );

  useEffect(() => {
    function handleResize() {
      setPageWidth(Math.min(window.innerWidth - 32, 700));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className="fixed inset-0 z-60 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[95vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:h-[90vh] sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-gray-900">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={uri}
              download={title}
              className="grid h-9 w-9 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"
              aria-label="Yuklab olish"
            >
              <Download size={18} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"
              aria-label="Yopish"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-gray-100"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {error ? (
            <div className="flex h-full items-center justify-center px-8">
              <p className="text-center text-sm font-semibold text-gray-400">
                Faylni ochib bo'lmadi
              </p>
            </div>
          ) : (
            <Document
              file={uri}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={() => setError(true)}
              loading={
                <div className="flex h-full items-center justify-center py-16">
                  <div className="h-7 w-7 animate-spin rounded-full border border-gray-200 border-t-gray-900" />
                </div>
              }
              className="flex flex-col items-center gap-3 py-4"
            >
              {Array.from({ length: numPages ?? 0 }, (_, i) => (
                <Page
                  key={i}
                  pageNumber={i + 1}
                  width={pageWidth}
                  className="overflow-hidden rounded-lg shadow-sm"
                  renderAnnotationLayer={false}
                />
              ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
