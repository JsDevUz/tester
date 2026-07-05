import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-gray-300" />}
            {isLast || !item.onClick ? (
              <span className={isLast ? 'font-semibold text-gray-800' : 'text-gray-400'}>
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="text-gray-400 transition-colors hover:text-indigo-500"
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
