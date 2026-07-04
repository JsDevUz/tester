import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, CreditCard, ClipboardList, Users, School, Settings,
  FileText, Radio, UserCheck, Hourglass, ShieldCheck, LogOut, X, type LucideIcon,
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
  const { admin, logout } = useAuthStore();

  const activeSection = SECTIONS.find((s) =>
    s.subItems
      ? s.subItems.some((si) => location.pathname === si.path || location.pathname.startsWith(si.path + '/'))
      : location.pathname === s.path || (s.path !== '/' && location.pathname.startsWith(s.path + '/')),
  );
  // null = "hali qo'lda bosilmagan, joriy faol bo'limni ko'rsat"; '' = "qo'lda yopilgan"; boshqa = qo'lda ochilgan bo'lim
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // Desktop: sub-panel joriy faol bo'limni avtomatik ochib turadi (agar qo'lda yopilmagan bo'lsa).
  const desktopShownSection = openKey === null
    ? activeSection
    : openKey === ''
      ? undefined
      : SECTIONS.find((s) => s.key === openKey);
  // Mobil: bottom sheet FAQAT qo'lda ochilganda ko'rinadi — sahifa o'zgarganda
  // yoki orqaga qaytilganda o'zi qayta ochilib qolmasligi kerak.
  const mobileShownSection = openKey ? SECTIONS.find((s) => s.key === openKey) : undefined;

  const initial = admin?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div
      className="flex flex-col lg:flex-row gap-3 bg-gray-50 p-3"
      style={{
        height: '100dvh',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
    >
      {/* ── Birinchi qatlam: desktopda chap ikon panel, mobilda pastki tab bar ── */}
      <div className="order-2 lg:order-1 shrink-0 bg-gray-900 rounded-2xl flex flex-row lg:flex-col items-center justify-between lg:justify-start px-2 lg:px-0 lg:py-4 lg:w-16 h-16 lg:h-auto">
        <button onClick={() => navigate('/')} className="hidden lg:block mb-6 shrink-0">
          <img src="/favicon.png" alt="Logo" className="w-9 h-9 rounded-xl object-cover" />
        </button>

        <nav className="flex flex-row lg:flex-col gap-1 flex-1 lg:w-full lg:px-2 justify-around lg:justify-start">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.key === section.key;
            const isOpen = openKey ? openKey === section.key : desktopShownSection?.key === section.key;
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
                className={`relative w-11 h-11 lg:w-full lg:aspect-square lg:h-auto rounded-xl flex items-center justify-center transition-colors duration-150 ${
                  isActive || isOpen
                    ? 'bg-white text-indigo-600'
                    : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isActive && (
                  <span className="hidden lg:block absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-indigo-400" />
                )}
                {isActive && (
                  <span className="lg:hidden absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />
                )}
                <Icon size={20} />
              </button>
            );
          })}
        </nav>

        {/* Settings — disabled, desktop only */}
        <button
          disabled
          title="Sozlamalar (tez orada)"
          className="hidden lg:flex w-full aspect-square rounded-xl items-center justify-center text-gray-600 cursor-not-allowed mb-2"
        >
          <Settings size={20} />
        </button>

        {/* Profil */}
        <button
          onClick={() => setProfileOpen(true)}
          title={admin?.name ?? ''}
          className="w-9 h-9 lg:w-9 lg:h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center shrink-0"
        >
          {initial}
        </button>
      </div>

      {/* ── Ikkinchi qatlam (desktop): joriy faol bo'limni avtomatik ochib turadigan yonma-yon panel ── */}
      {desktopShownSection?.subItems && (
        <div className="hidden lg:flex relative order-2 shrink-0 bg-white border border-gray-100 flex-col py-5 px-3 w-64">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-3">
            {desktopShownSection.label}
          </p>
          <div className="flex flex-col gap-1">
            {desktopShownSection.subItems.map((item) => {
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

          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="mt-auto pt-4 border-t border-gray-100 flex items-center gap-2.5 px-2 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{admin?.name}</p>
              {admin?.phone && <p className="text-xs text-gray-400 truncate">{admin.phone}</p>}
            </div>
          </button>

          {/* Profil menyusi (desktop) — sub-panel ichida, uning yuqorisida joylashadi */}
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute z-50 bottom-full left-3 right-3 mb-2 bg-white rounded-2xl border border-gray-100 shadow-lg p-2">
                {admin?.role === 'super' && (
                  <button
                    onClick={() => { navigate('/admins'); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  >
                    <ShieldCheck size={17} className="text-gray-400 shrink-0" />
                    Adminlar
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={17} className="shrink-0" />
                  Chiqish
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Ikkinchi qatlam (mobil): faqat qo'lda ochilganda ko'rinadigan bottom sheet ── */}
      {mobileShownSection?.subItems && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpenKey('')} />
          <div className="order-1 fixed bottom-3 left-3 right-3 z-50 rounded-2xl bg-white border border-gray-100 flex flex-col py-5 px-3">
            <div className="flex items-center justify-between px-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {mobileShownSection.label}
              </p>
              <button onClick={() => setOpenKey('')} className="text-gray-300 hover:text-gray-500">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {mobileShownSection.subItems.map((item) => {
                const ItemIcon = item.icon;
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setOpenKey(''); }}
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
          </div>
        </div>
      )}

      {/* ── Asosiy kontent ── */}
      <div className="order-1 lg:order-3 flex-1 min-w-0 min-h-0 bg-white rounded-2xl border border-gray-100 overflow-y-auto">{children}</div>

      {/* ── Profil menyusi (chiqish / adminlar) — mobilda doim shu yerdan, desktopda faqat
           ikkinchi qatlam panel ochiq bo'lmasa (chunki bo'lsa, o'sha panel ichida bor) ── */}
      {profileOpen && !desktopShownSection?.subItems && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setProfileOpen(false)} />
          <div className="fixed z-50 bottom-3 left-3 right-3 lg:bottom-16 lg:left-3 lg:right-auto lg:w-64 bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2.5 px-1 mb-3 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{admin?.name}</p>
                {admin?.phone && <p className="text-xs text-gray-400 truncate">{admin.phone}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {admin?.role === 'super' && (
                <button
                  onClick={() => { navigate('/admins'); setProfileOpen(false); }}
                  className="flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <ShieldCheck size={17} className="text-gray-400 shrink-0" />
                  Adminlar
                </button>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={17} className="shrink-0" />
                Chiqish
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
