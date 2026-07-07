interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({ title, description, onConfirm, onClose }: ConfirmDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-80 rounded-3xl bg-white p-6">
        <p className="mb-1 text-sm font-semibold text-gray-800">{title}</p>
        <p className="mb-5 text-sm text-gray-400">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            Bekor qilish
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
          >
            O'chirish
          </button>
        </div>
      </div>
    </div>
  );
}
