import { useEffect, useState } from "react";
import { Clock3, Inbox } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { StudentsSectionTabs } from "../components/students/StudentsSectionTabs";
import { formatDate } from "../utils/date";
import {
  apiGetPendingPlanAssignment,
  type ApiPendingPlanAssignment,
} from "../api/groups";

export function PendingStudentsPage() {
  const [rows, setRows] = useState<ApiPendingPlanAssignment[]>([]);

  useEffect(() => {
    void apiGetPendingPlanAssignment().then(setRows);
  }, []);

  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="rounded-2xl bg-white p-4">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              Ruxsat kutayotganlar
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Guruhga qo'shilgan, lekin hali tarif tanlanmagan o'quvchilar
            </p>
          </div>

          <StudentsSectionTabs counts={{ "/students/pending": rows.length }} />

          {rows.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl bg-white px-4 py-16 text-center text-gray-400">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gray-300">
                <Clock3 size={28} />
              </div>
              <p className="text-sm font-semibold text-gray-600">
                Ruxsat kutayotgan o'quvchilar yo'q
              </p>
              <p className="mt-1 text-xs">
                Guruhga qo'shilib, tarif tanlamagan o'quvchilar shu yerda ko'rinadi.
              </p>
              <Inbox size={28} className="mt-5 opacity-20" />
            </div>
          ) : (
            <div className="rounded-2xl bg-white">
              <div className="md:hidden flex flex-col gap-2 p-3">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl bg-gray-50 px-3.5 py-3"
                  >
                    <p className="text-sm font-semibold text-gray-800">
                      {r.studentName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.groupName} — {r.courseTitle}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(r.joinedAt)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-210 text-left">
                  <thead className="text-sm font-medium text-gray-700">
                    <tr>
                      <th className="px-5 py-4">O'quvchi</th>
                      <th className="px-5 py-4">Kurs / guruh</th>
                      <th className="px-5 py-4">Qo'shilgan sana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-indigo-50/40"
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-gray-800">
                            {r.studentName}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {r.studentPhone ?? ""}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {r.groupName} — {r.courseTitle}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {formatDate(r.joinedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
