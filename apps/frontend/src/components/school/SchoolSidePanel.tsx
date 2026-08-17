import { useLocation, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, UsersRound, Link2, type LucideIcon } from 'lucide-react';

interface SchoolTab {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const TABS: SchoolTab[] = [
  { path: '/school/settings', label: 'Maktab sozlamalari', description: "Ma'lumot va moslashtirish", icon: SlidersHorizontal },
  { path: '/school/staff', label: 'Mening xodimlarim', description: 'Xodimlar va rollar', icon: UsersRound },
  { path: '/school/invite', label: "Ro'yxatdan o'tish", description: 'Taklif havolasi', icon: Link2 },
];

export function SchoolSidePanel() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-68">
      <div className="flex flex-col gap-1 rounded-2xl bg-[var(--surface-bg)] p-2 shadow-xs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] font-semibold'
              }`}
            >
              <Icon size={16} className={`shrink-0 ${active ? 'text-white' : 'text-[var(--text-muted)]'}`} />
              <div className="min-w-0">
                <p className={`truncate text-xs font-bold ${active ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                  {tab.label}
                </p>
                <p className={`truncate text-[11px] font-medium mt-0.5 ${active ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{tab.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
