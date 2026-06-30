import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { FolderCard } from '../components/FolderCard';
import { NewFolderModal } from '../components/NewFolderModal';
import { useFolderStore } from '../stores/folderStore';
import type { Folder } from '../api/folders';

export function DashboardPage() {
  const navigate = useNavigate();
  const { folders, fetchFolders, createFolder, updateFolder, deleteFolder } = useFolderStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null);

  useEffect(() => { fetchFolders(); }, []);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Papkalar</h2>
          <button
            onClick={() => setShowNewModal(true)}
            className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600"
          >
            + Yangi papka
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
          {folders.length === 0 && (
            <p className="text-gray-400 text-sm mt-8 col-span-full text-center">Hali papkalar yo'q. Yangisini yarating!</p>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewFolderModal onSubmit={handleCreate} onClose={() => setShowNewModal(false)} />
      )}
      {editFolder && (
        <NewFolderModal
          title="Papkani tahrirlash"
          initial={{ name: editFolder.name, color: editFolder.color }}
          onSubmit={handleRename}
          onClose={() => setEditFolder(null)}
        />
      )}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
              <p className="text-sm font-medium text-gray-800 mb-1">Papkani o'chirish</p>
              <p className="text-sm text-gray-400 mb-5">"{confirmDelete.name}" papkasi va undagi barcha testlar o'chiriladimi?</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)} className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700">Bekor qilish</button>
                <button onClick={handleDelete} className="text-sm px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">O'chirish</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
