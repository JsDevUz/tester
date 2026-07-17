import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function PageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
      <span>Qatorlar:</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:border-indigo-400" aria-label="Sahifadagi qatorlar soni">
        {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

interface PaginationControlsProps {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function PaginationControls({ page, pageCount, pageSize, onPageChange, onPageSizeChange }: PaginationControlsProps) {
  const currentPage = Math.min(page, pageCount);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-3">
      <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Oldingi sahifa">
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button key={pageNumber} type="button" onClick={() => onPageChange(pageNumber)} className={`h-8 w-8 rounded-xl text-sm font-semibold transition-colors ${pageNumber === currentPage ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {pageNumber}
            </button>
          ))}
          <button type="button" onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Keyingi sahifa">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
