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
  const { tests, fetchTests, createTest, updateTest, deleteTest } = useTestStore();
  const { folders, fetchFolders } = useFolderStore();
  const [showModal, setShowModal] = useState(false);
  const [editTest, setEditTest] = useState<Test | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; test: Test } | null>(null);

  const folder = folders.find((f) => f.id === folderId);

  useEffect(() => {
    if (folderId) fetchTests(folderId);
    if (folders.length === 0) fetchFolders();
  }, [folderId]);

  async function handleCreate(data: CreateTestData) {
    const test = await createTest(data);
    setShowModal(false);
    navigate(`/tests/${test.id}/edit`);
  }

  async function handleUpdate(data: CreateTestData) {
    if (!editTest) return;
    await updateTest(editTest.id, data);
    setEditTest(null);
  }

  async function handleDelete() {
    if (!menu) return;
    if (!confirm(`"${menu.test.name}" testini o'chirishni tasdiqlaysizmi?`)) return;
    await deleteTest(menu.test.id);
    setMenu(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← Papkalar</button>
            <span className="text-gray-400">/</span>
            <h2 className="text-sm font-medium text-gray-700">{folder?.name ?? 'Folder'}</h2>
          </div>
          <button onClick={() => setShowModal(true)}
            className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600">
            + Yangi test
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              onDoubleClick={() => navigate(`/tests/${test.id}/edit`)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, test }); }}
            />
          ))}
          {tests.length === 0 && (
            <p className="text-gray-400 text-sm mt-8 w-full text-center">Hali testlar yo'q. Yangisini yarating!</p>
          )}
        </div>
      </div>

      {showModal && folderId && (
        <TestSettingsModal folderId={folderId} title="Yangi test" onSubmit={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {editTest && folderId && (
        <TestSettingsModal
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
            deadline: editTest.deadline ?? undefined,
          }}
          onSubmit={handleUpdate}
          onClose={() => setEditTest(null)}
        />
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px]"
            style={{ top: menu.y, left: menu.x }}
          >
            <button
              onClick={() => { navigate(`/tests/${menu.test.id}/submissions`); setMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Natijalar
            </button>
            <button
              onClick={() => { setEditTest(menu.test); setMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sozlamalar
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              O'chirish
            </button>
          </div>
        </>
      )}
    </div>
  );
}
