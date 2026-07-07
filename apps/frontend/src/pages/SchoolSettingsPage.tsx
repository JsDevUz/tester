import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { useSchoolStore } from '../stores/schoolStore';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;

export function SchoolSettingsPage() {
  const { name, description, renameSchool, setSchoolDescription } = useSchoolStore();

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 text-lg font-bold text-gray-800">Maktab sozlamalari</h1>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Maktab nomi va tavsifi</h2>
            <p className="mb-4 text-sm text-gray-400">Bu yerda maktab nomi va tavsifini tahrirlashingiz mumkin</p>

            <p className="mb-1.5 text-sm text-gray-500">Maktab nomi</p>
            <input
              value={name}
              onChange={(e) => renameSchool(e.target.value.slice(0, NAME_MAX))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mb-4 mt-1 text-right text-xs text-gray-300">{name.length} / {NAME_MAX}</p>

            <p className="mb-1.5 text-sm text-gray-500">Tavsif</p>
            <textarea
              value={description}
              onChange={(e) => setSchoolDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="Maktabingiz haqida qisqacha ma'lumot"
              rows={3}
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{description.length} / {DESCRIPTION_MAX}</p>
          </div>
        </div>

        <SchoolSidePanel />
      </div>
    </AppShell>
  );
}
