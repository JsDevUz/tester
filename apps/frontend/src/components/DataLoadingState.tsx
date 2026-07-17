import { LoaderCircle } from 'lucide-react';

interface DataLoadingStateProps {
  label?: string;
  className?: string;
}

export function DataLoadingState({
  label = "Ma'lumotlar yuklanmoqda...",
  className = '',
}: DataLoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-white text-gray-400 ${className}`}
    >
      <LoaderCircle size={28} className="animate-spin text-indigo-500" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
