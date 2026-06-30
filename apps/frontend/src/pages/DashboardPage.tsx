import { useEffect, useState } from 'react';
import { Toolbar } from '../components/Toolbar';
import { FolderCard } from '../components/FolderCard';
import { FolderContextMenu } from '../components/FolderContextMenu';
import { NewFolderModal } from '../components/NewFolderModal';
import { useFolderStore } from '../stores/folderStore';
import type { Folder } from '../api/folders';

export function DashboardPage() {
  const { folders, fetchFolders, createFolder, updateFolder, deleteFolder } = useFolderStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);

  useEffect(() => { fetchFolders(); }, []);

  function handleContextMenu(e: React.MouseEvent, folder: Folder) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, folder });
  }

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
    if (!menu) return;
    await deleteFolder(menu.folder.id);
    setMenu(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">My Folders</h2>
          <button
            onClick={() => setShowNewModal(true)}
            className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600"
          >
            + New Folder
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onDoubleClick={() => { /* future: navigate to folder tests */ }}
              onContextMenu={(e) => handleContextMenu(e, folder)}
            />
          ))}
          {folders.length === 0 && (
            <p className="text-gray-400 text-sm mt-8 w-full text-center">No folders yet. Create one!</p>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewFolderModal onSubmit={handleCreate} onClose={() => setShowNewModal(false)} />
      )}
      {editFolder && (
        <NewFolderModal
          title="Rename Folder"
          initial={{ name: editFolder.name, color: editFolder.color }}
          onSubmit={handleRename}
          onClose={() => setEditFolder(null)}
        />
      )}
      {menu && (
        <FolderContextMenu
          x={menu.x}
          y={menu.y}
          onRename={() => { setEditFolder(menu.folder); setMenu(null); }}
          onChangeColor={() => { setEditFolder(menu.folder); setMenu(null); }}
          onDelete={handleDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
