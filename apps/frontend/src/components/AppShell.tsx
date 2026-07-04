import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, CreditCard, ClipboardList, Users, School, Settings,
  FileText, Radio, UserCheck, Hourglass, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface SubItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface NavSection {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  subItems?: SubItem[];
}

const SECTIONS: NavSection[] = [
  { key: 'lessons', label: 'Darslar', icon: BookOpen, path: '/lessons' },
  { key: 'payments', label: "To'lovlar", icon: CreditCard, path: '/payments' },
  {
    key: 'practice', label: 'Amaliyotlar', icon: ClipboardList, path: '/',
    subItems: [
      { label: 'Testlar', path: '/', icon: FileText },
      { label: 'Live musobaqa', path: '/live', icon: Radio },
    ],
  },
  {
    key: 'students', label: "O'quvchilar", icon: Users, path: '/students',
    subItems: [
      { label: 'Barchasi', path: '/students', icon: UserCheck },
      { label: 'Ruxsat kutayotganlar', path: '/students/pending', icon: Hourglass },
    ],
  },
  { key: 'school', label: 'Mening Maktabim', icon: School, path: '/school' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const admin = useAuthStore((s) => s.admin);

  const activeSection = SECTIONS.find((s) =>
    s.subItems
      ? s.subItems.some((si) => location.pathname === si.path || location.pathname.startsWith(si.path + '/'))
      : location.pathname === s.path || (s.path !== '/' && location.pathname.startsWith(s.path + '/')),
  );
  // null = "hali qo'lda bosilmagan, joriy faol bo'limni ko'rsat"; '' = "qo'lda yopilgan"; boshqa = qo'lda ochilgan bo'lim
  const [openKey, setOpenKey] = useState<string | null>(null);
  const shownSection = openKey === null
    ? activeSection
    : openKey === ''
      ? undefined
      : SECTIONS.find((s) => s.key === openKey);

  const initial = admin?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ── Birinchi qatlam: ikon panel ── */}
      <div className="w-16 shrink-0 bg-gray-900 flex flex-col items-center py-4">
        <button onClick={() => navigate('/')} className="mb-6 shrink-0">
          <img src="/favicon.png" alt="Logo" className="w-9 h-9 rounded-xl object-cover" />
        </button>

        <nav className="flex-1 flex flex-col gap-1 w-full px-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.key === section.key;
            const isOpen = shownSection?.key === section.key;
            return (
              <button
                key={section.key}
                onClick={() => {
                  if (section.subItems) {
                    setOpenKey(isOpen ? '' : section.key);
                  } else {
                    navigate(section.path);
                    setOpenKey('');
                  }
                }}
                title={section.label}
                className={`relative w-full aspect-square rounded-xl flex items-center justify-center transition-colors duration-150 ${
                  isActive || isOpen
                    ? 'bg-white text-indigo-600'
                    : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isActive && (
                  <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-indigo-400" />
                )}
                <Icon size={20} />
              </button>
            );
          })}
        </nav>

        {/* Settings — disabled */}
        <button
          disabled
          title="Sozlamalar (tez orada)"
          className="w-full aspect-square rounded-xl flex items-center justify-center text-gray-600 cursor-not-allowed mb-2"
        >
          <Settings size={20} />
        </button>

        {/* Profil */}
        <button
          disabled
          title={admin?.name ?? ''}
          className="w-9 h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center cursor-default shrink-0"
        >
          {initial}
        </button>
      </div>

      {/* ── Ikkinchi qatlam: kengaytirilgan sidebar (faqat sub-items bo'lsa) ── */}
      {shownSection?.subItems && (
        <div className="w-64 shrink-0 bg-white border-r border-gray-100 flex flex-col py-5 px-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-3">
            {shownSection.label}
          </p>
          <div className="flex flex-col gap-1">
            {shownSection.subItems.map((item) => {
              const ItemIcon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`group flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <ItemIcon
                    size={17}
                    className={`shrink-0 transition-colors ${
                      isActive ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Profil ma'lumoti */}
          <div className="mt-auto pt-4 border-t border-gray-100 flex items-center gap-2.5 px-2">
            <div className="w-9 h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{admin?.name}</p>
              {admin?.phone && <p className="text-xs text-gray-400 truncate">{admin.phone}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Asosiy kontent ── */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
