import { Clock3, Inbox } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { StudentsSectionTabs } from "../components/students/StudentsSectionTabs";

export function PendingStudentsPage() {
  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="rounded-2xl bg-white p-4">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              Ruxsat kutayotganlar
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Ro'yxatdan o'tish yoki kirish uchun tasdiq kutayotganlar
            </p>
          </div>

          <StudentsSectionTabs />

          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl bg-white px-4 py-16 text-center text-gray-400">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gray-300">
              <Clock3 size={28} />
            </div>
            <p className="text-sm font-semibold text-gray-600">
              Ruxsat kutayotgan o'quvchilar yo'q
            </p>
            <p className="mt-1 text-xs">
              Yangi so'rovlar kelganda shu yerda ko'rinadi.
            </p>
            <Inbox size={28} className="mt-5 opacity-20" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
