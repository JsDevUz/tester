import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
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

        {!folders ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : folders.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali papka yo'q. Yangisini yarating!</p>
        ) : (
          <div className="flex flex-wrap gap-3">
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
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl pointer-events-auto">
              <p className="mb-1 text-sm font-medium text-gray-700">Papkani o'chirish</p>
              <p className="mb-5 text-sm text-gray-400">
                "{confirmDelete.name}" o'chirilsinmi? Ichidagi barcha testlar ham o'chadi.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Bekor qilish
                </button>
                <button onClick={() => void handleDelete()} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </StudentShell>
  );
}
