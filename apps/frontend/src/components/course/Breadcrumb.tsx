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
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)] opacity-60" />}
            {isLast || !item.onClick ? (
              <span className={isLast ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] cursor-pointer"
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
