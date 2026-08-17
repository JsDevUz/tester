import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { FolderCard } from "../components/FolderCard";
import { NewFolderModal } from "../components/NewFolderModal";
import { useFolderStore } from "../stores/folderStore";
import type { Folder } from "../api/folders";
import { DataLoadingState } from "../components/DataLoadingState";

export function DashboardPage() {
  const navigate = useNavigate();
  const { folders, foldersLoading, foldersLoaded, foldersError, fetchFolders, createFolder, updateFolder, deleteFolder } =
    useFolderStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null);

  useEffect(() => {
    void fetchFolders().catch(() => undefined);
  }, [fetchFolders]);

  async function handleCreate(name: string, color: string) {
    await createFolder(name, color);
    setShowNewModal(false);
  }

  async function handleRename(name: string, color: string) {
    if (!editFolder) return;
    await updateFolder(editFolder.id, { name, color });
    setEditFolder(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await deleteFolder(confirmDelete.id);
    setConfirmDelete(null);
  }

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 w-full p-6 pb-10">
          <div className="flex items-center justify-between gap-2 mb-6">
            <h2 className="text-xl font-bold text-gray-800">Papkalar</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/live")}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700  hover:bg-gray-50"
              >
                <Radio size={16} />
                <span className="hidden sm:inline">Jonli musobaqalar</span>
                <span className="sm:hidden">Jonli</span>
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600"
              >
                + Yangi papka
              </button>
            </div>
          </div>
          {foldersLoading && !foldersLoaded ? (
            <DataLoadingState label="Papkalar yuklanmoqda..." className="min-h-64" />
          ) : foldersError && folders.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              <p>{foldersError}</p>
              <button type="button" onClick={() => void fetchFolders().catch(() => undefined)} className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">Qayta urinish</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  testCount={folder.testCount}
                  onClick={() => navigate(`/folders/${folder.id}`)}
                  onEdit={() => setEditFolder(folder)}
                  onDelete={() => setConfirmDelete(folder)}
                />
              ))}
              {foldersLoaded && folders.length === 0 && (
                <p className="text-gray-400 text-sm mt-8 col-span-full text-center">
                  Hali papkalar yo'q. Yangisini yarating!
                </p>
              )}
            </div>
          )}
        </div>

        {showNewModal && (
          <NewFolderModal
            onSubmit={handleCreate}
            onClose={() => setShowNewModal(false)}
          />
        )}
        {editFolder && (
          <NewFolderModal
            title="Papkani tahrirlash"
            initial={{ name: editFolder.name, color: editFolder.color }}
            onSubmit={handleRename}
            onClose={() => setEditFolder(null)}
          />
        )}
        <p className="fixed bottom-3 right-4 text-[10px] text-gray-300 select-none">
          v1.7
        </p>
        {confirmDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          >
            <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5">
              <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                Papkani o'chirish
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                <span className="font-bold text-[var(--text-primary)]">"{confirmDelete.name}"</span> papkasi va undagi barcha testlar
                o'chiriladimi?
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors cursor-pointer"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
