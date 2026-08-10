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
    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-72">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-white p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = location.pathname === tab.path;
          return (
            <div
              key={tab.path}
              role="button"
              tabIndex={0}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm cursor-pointer ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
              <Icon size={18} className={`shrink-0 ${active ? 'text-gray-900' : 'text-gray-400'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold ${active ? 'text-gray-900' : 'text-gray-700'}`}>
                  {tab.label}
                </p>
                <p className="truncate text-xs text-gray-300">{tab.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
