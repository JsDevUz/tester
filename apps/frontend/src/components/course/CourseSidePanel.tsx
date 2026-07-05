import {
  LayoutGrid, SlidersHorizontal, Send, Users, UserRound, HelpCircle, ListChecks, ArrowLeft,
} from 'lucide-react';

interface CourseSidePanelProps {
  onBackToList: () => void;
}

interface SideTab {
  key: string;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
  active?: boolean;
}

const TABS: SideTab[] = [
  { key: 'content', label: 'Kontent', description: 'Modullar, darslar va amaliyot', icon: LayoutGrid, active: true },
  { key: 'settings', label: 'Sozlamalar', description: "Ma'lumot va moslashtirish", icon: SlidersHorizontal },
  { key: 'launch', label: 'Ishga tushirish va tariflar', description: 'Savdo va narxlar sozlamalari', icon: Send },
  { key: 'groups', label: 'Guruhlar', description: "O'quvchilarni ajratish", icon: Users },
  { key: 'students', label: "O'quvchilar", description: 'Statistika va taraqqiyot', icon: UserRound },
  { key: 'faq', label: 'FAQ', description: 'Shubhalarga javoblar', icon: HelpCircle },
  { key: 'homework', label: 'Vazifalarni tekshirish', description: 'Talabalardan amaliyot', icon: ListChecks },
];

export function CourseSidePanel({ onBackToList }: CourseSidePanelProps) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <div
              key={tab.key}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                tab.active
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'cursor-not-allowed text-gray-300'
              }`}
            >
              <Icon size={18} className={`shrink-0 ${tab.active ? 'text-indigo-500' : 'text-gray-300'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold ${tab.active ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {tab.label}
                </p>
                <p className="truncate text-xs text-gray-300">{tab.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onBackToList}
        className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
      >
        <ArrowLeft size={16} /> Kurslarga qaytish
      </button>
    </div>
  );
}
