import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { TestCard } from '../components/TestCard';
import { TestSettingsModal } from '../components/TestSettingsModal';
import { useTestStore } from '../stores/testStore';
import { useFolderStore } from '../stores/folderStore';
import type { Test, CreateTestData } from '../api/tests';

export function FolderViewPage() {
  const { id: folderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tests, fetchTests, createTest, deleteTest } = useTestStore();
  const { folders } = useFolderStore();
  const [showModal, setShowModal] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; test: Test } | null>(null);

  const folder = folders.find((f) => f.id === folderId);

  useEffect(() => {
    if (folderId) fetchTests(folderId);
  }, [folderId]);

  async function handleCreate(data: CreateTestData) {
    const test = await createTest(data);
    setShowModal(false);
    navigate(`/tests/${test.id}/edit`);
  }

  async function handleDelete() {
    if (!menu) return;
    if (!confirm(`Delete "${menu.test.name}"?`)) return;
    await deleteTest(menu.test.id);
    setMenu(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← Folders</button>
            <span className="text-gray-400">/</span>
            <h2 className="text-sm font-medium text-gray-700">{folder?.name ?? 'Folder'}</h2>
          </div>
          <button onClick={() => setShowModal(true)}
            className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600">
            + New Test
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              onDoubleClick={() => navigate(`/tests/${test.id}/edit`)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, test }); }}
            />
          ))}
          {tests.length === 0 && (
            <p className="text-gray-400 text-sm mt-8 w-full text-center">No tests yet. Create one!</p>
          )}
        </div>
      </div>

      {showModal && folderId && (
        <TestSettingsModal folderId={folderId} onSubmit={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px]"
            style={{ top: menu.y, left: menu.x }}
          >
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
