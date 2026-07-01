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
  const [confirmDelete, setConfirmDelete] = useState<Test | null>(null);

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
    if (!confirmDelete) return;
    await deleteTest(confirmDelete.id);
    setConfirmDelete(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
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
        <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {tests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              onEdit={() => navigate(`/tests/${test.id}/edit`)}
              onSettings={() => setEditTest(test)}
              onDelete={() => setConfirmDelete(test)}
              onResults={() => navigate(`/tests/${test.id}/submissions`)}
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
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
              <p className="text-sm text-gray-700 mb-1 font-medium">Testni o'chirish</p>
              <p className="text-sm text-gray-400 mb-5">"{confirmDelete.name}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)}
                  className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700">Bekor qilish</button>
                <button onClick={handleDelete}
                  className="text-sm px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">O'chirish</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
