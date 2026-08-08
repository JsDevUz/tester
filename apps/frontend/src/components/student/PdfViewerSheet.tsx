import { Download, X } from "lucide-react";

export function PdfViewerSheet({
  uri,
  title,
  onClose,
}: {
  uri: string;
  title: string;
  onClose: () => void;
}) {
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
        <div className="min-h-0 flex-1 bg-gray-100">
          <iframe src={uri} title={title} className="h-full w-full border-0" />
        </div>
      </div>
    </div>
  );
}
