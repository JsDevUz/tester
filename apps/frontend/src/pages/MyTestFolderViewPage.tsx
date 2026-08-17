import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentTestCard } from "../components/StudentTestCard";
import { StudentTestSettingsModal } from "../components/StudentTestSettingsModal";
import {
  apiFetchStudentTests,
  apiCreateStudentTest,
  apiUpdateStudentTest,
  apiDeleteStudentTest,
  apiFetchStudentFolders,
  type StudentTest,
  type CreateStudentTestData,
  type StudentFolder,
} from "../api/student-tests";

export function MyTestFolderViewPage() {
  const { id: folderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tests, setTests] = useState<StudentTest[] | null>(null);
  const [folder, setFolder] = useState<StudentFolder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTest, setEditTest] = useState<StudentTest | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudentTest | null>(null);

  async function load() {
    if (!folderId) return;
    try {
      const [testList, folders] = await Promise.all([
        apiFetchStudentTests(folderId),
        apiFetchStudentFolders(),
      ]);
      setTests(testList);
      setFolder(folders.find((f) => f.id === folderId) ?? null);
    } catch {
      toast.error("Testlarni yuklab bo'lmadi");
      setTests([]);
    }
  }

  useEffect(() => { void load(); }, [folderId]);

  async function handleCreate(data: CreateStudentTestData) {
    try {
      const test = await apiCreateStudentTest(data);
      setShowCreate(false);
      navigate(`/my-tests/tests/${test.id}/edit`);
    } catch {
      toast.error("Test yaratib bo'lmadi");
    }
  }

  async function handleUpdate(data: CreateStudentTestData) {
    if (!editTest) return;
    try {
      await apiUpdateStudentTest(editTest.id, data);
      setEditTest(null);
      void load();
    } catch {
      toast.error("Testni yangilab bo'lmadi");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await apiDeleteStudentTest(confirmDelete.id);
      setConfirmDelete(null);
      void load();
    } catch {
      toast.error("Testni o'chirib bo'lmadi");
    }
  }

  if (!folderId) return null;

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/my-tests")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Papkalar
        </button>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-gray-900">{folder?.name ?? "Papka"}</h1>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            <Plus size={16} /> Yangi test
          </button>
        </div>

        {!tests ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : tests.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali testlar yo'q. Yangisini yarating!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 items-start">
            {tests.map((test) => (
              <StudentTestCard
                key={test.id}
                test={test}
                onEdit={() => navigate(`/my-tests/tests/${test.id}/edit`)}
                onSettings={() => setEditTest(test)}
                onDelete={() => setConfirmDelete(test)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && folderId && (
        <StudentTestSettingsModal folderId={folderId} title="Yangi test" onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTest && folderId && (
        <StudentTestSettingsModal
          folderId={folderId}
          title="Test sozlamalari"
          initial={{
            name: editTest.name,
            description: editTest.description ?? undefined,
            timeLimit: editTest.timeLimit ?? undefined,
            showResults: editTest.showResults,
            shuffleQuestions: editTest.shuffleQuestions,
            shuffleOptions: editTest.shuffleOptions,
            oneByOne: editTest.oneByOne,
            autoCompleteOnLeave: editTest.autoCompleteOnLeave,
          }}
          onSubmit={handleUpdate}
          onClose={() => setEditTest(null)}
        />
      )}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5">
            <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">Testni o'chirish</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-[var(--text-primary)]">"{confirmDelete.name}"</span> o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors cursor-pointer"
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
