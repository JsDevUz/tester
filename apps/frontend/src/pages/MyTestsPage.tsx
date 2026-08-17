import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";
import { FolderCard } from "../components/FolderCard";
import { NewFolderModal } from "../components/NewFolderModal";
import {
  apiFetchStudentFolders,
  apiCreateStudentFolder,
  apiUpdateStudentFolder,
  apiDeleteStudentFolder,
  type StudentFolder,
} from "../api/student-tests";

export function MyTestsPage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<StudentFolder[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFolder, setEditFolder] = useState<StudentFolder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudentFolder | null>(null);

  async function load() {
    try {
      setFolders(await apiFetchStudentFolders());
    } catch {
      toast.error("Papkalarni yuklab bo'lmadi");
      setFolders([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(name: string, color: string) {
    try {
      await apiCreateStudentFolder(name, color);
      setShowCreate(false);
      void load();
    } catch {
      toast.error("Papka yaratib bo'lmadi");
    }
  }

  async function handleUpdate(name: string, color: string) {
    if (!editFolder) return;
    try {
      await apiUpdateStudentFolder(editFolder.id, { name, color });
      setEditFolder(null);
      void load();
    } catch {
      toast.error("Papkani yangilab bo'lmadi");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await apiDeleteStudentFolder(confirmDelete.id);
      setConfirmDelete(null);
      void load();
    } catch {
      toast.error("Papkani o'chirib bo'lmadi");
    }
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/jamm")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Mening testlarim</h1>
            <p className="mt-1 text-sm text-gray-400">O'z testlaringizni tuzing va ulashing</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 p-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            <FolderPlus size={16} />
          </button>
        </div>

        <StudentActiveBanners className="mb-6" />

        {!folders ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : folders.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali papka yo'q. Yangisini yarating!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                testCount={folder.testCount}
                onClick={() => navigate(`/my-tests/${folder.id}`)}
                onEdit={() => setEditFolder(folder)}
                onDelete={() => setConfirmDelete(folder)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <NewFolderModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editFolder && (
        <NewFolderModal
          title="Papkani tahrirlash"
          initial={{ name: editFolder.name, color: editFolder.color }}
          onSubmit={handleUpdate}
          onClose={() => setEditFolder(null)}
        />
      )}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5">
            <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">Papkani o'chirish</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-[var(--text-primary)]">"{confirmDelete.name}"</span> o'chirilsinmi? Ichidagi barcha testlar ham o'chadi.
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
