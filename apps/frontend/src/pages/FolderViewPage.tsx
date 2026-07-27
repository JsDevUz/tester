import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "../components/AppShell";
import { TestCard } from "../components/TestCard";
import { TestSettingsModal } from "../components/TestSettingsModal";
import { TestPinModal } from "../components/TestPinModal";
import { useTestStore } from "../stores/testStore";
import { useFolderStore } from "../stores/folderStore";
import { apiGetTestPin, type Test, type CreateTestData } from "../api/tests";
import { DataLoadingState } from "../components/DataLoadingState";

export function FolderViewPage() {
  const { id: folderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tests, testsLoading, testsLoaded, testsError, fetchTests, createTest, updateTest, deleteTest } =
    useTestStore();
  const { folders, foldersLoaded, fetchFolders } = useFolderStore();
  const [showModal, setShowModal] = useState(false);
  const [editTest, setEditTest] = useState<Test | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Test | null>(null);
  const [pinTest, setPinTest] = useState<Test | null>(null);
  const [pinnedTestIds, setPinnedTestIds] = useState<Set<string>>(new Set());
  const [pinStatusReload, setPinStatusReload] = useState(0);
  const pinStatusGeneration = useRef(0);

  const folder = folders.find((f) => f.id === folderId);

  useEffect(() => {
    if (folderId) void fetchTests(folderId).catch(() => undefined);
  }, [folderId, fetchTests]);

  useEffect(() => {
    if (!foldersLoaded) void fetchFolders().catch(() => undefined);
  }, [foldersLoaded, fetchFolders]);

  useEffect(() => {
    if (tests.length === 0) {
      setPinnedTestIds(new Set());
      return;
    }
    let cancelled = false;
    const generation = pinStatusGeneration.current;
    const currentTestIds = new Set(tests.map((test) => test.id));

    void Promise.allSettled(tests.map((test) => apiGetTestPin(test.id))).then((results) => {
      if (cancelled || generation !== pinStatusGeneration.current) return;

      setPinnedTestIds((previous) => {
        const next = new Set([...previous].filter((id) => currentTestIds.has(id)));
        const now = Date.now();
        results.forEach((result, index) => {
          if (result.status === "rejected") return;
          const testId = tests[index].id;
          const startsAt = result.value ? Date.parse(result.value.startsAt) : Number.NaN;
          const endsAt = result.value ? Date.parse(result.value.endsAt) : Number.NaN;
          const isActive =
            Number.isFinite(startsAt) &&
            Number.isFinite(endsAt) &&
            startsAt <= now &&
            now <= endsAt;

          if (isActive) next.add(testId);
          else next.delete(testId);
        });
        return next;
      });

      if (results.some((result) => result.status === "rejected")) {
        toast.error("Ayrim testlarning tayinlanish holatini yuklab bo'lmadi");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tests, pinStatusReload]);

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
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 p-6 w-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/")}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ← Papkalar
              </button>
              <span className="text-gray-400">/</span>
              <h2 className="text-sm font-medium text-gray-700">
                {folder?.name ?? "Folder"}
              </h2>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600"
            >
              + Yangi test
            </button>
          </div>
          {testsLoading && !testsLoaded ? (
            <DataLoadingState label="Testlar yuklanmoqda..." className="min-h-64" />
          ) : testsError && tests.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              <p>{testsError}</p>
              <button type="button" onClick={() => folderId && void fetchTests(folderId).catch(() => undefined)} className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">Qayta urinish</button>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-5 items-start">
            {tests.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                onEdit={() => navigate(`/tests/${test.id}/edit`)}
                onSettings={() => setEditTest(test)}
                onDelete={() => setConfirmDelete(test)}
                onResults={() => navigate(`/tests/${test.id}/submissions`)}
                onLive={() => navigate(`/live?testId=${test.id}`)}
                onPin={() => setPinTest(test)}
                hasPin={pinnedTestIds.has(test.id)}
              />
            ))}
            {testsLoaded && tests.length === 0 && (
              <p className="text-gray-400 text-sm mt-8 w-full text-center">
                Hali testlar yo'q. Yangisini yarating!
              </p>
            )}
          </div>
          )}
        </div>

        {showModal && folderId && (
          <TestSettingsModal
            folderId={folderId}
            title="Yangi test"
            onSubmit={handleCreate}
            onClose={() => setShowModal(false)}
          />
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
              requireAuth: editTest.requireAuth,
              autoCompleteOnLeave: editTest.autoCompleteOnLeave,
              onceOnly: editTest.onceOnly,
              deadline: editTest.deadline ?? undefined,
            }}
            onSubmit={handleUpdate}
            onClose={() => setEditTest(null)}
          />
        )}
        {pinTest && (
          <TestPinModal
            testId={pinTest.id}
            testName={pinTest.name}
            onClose={() => setPinTest(null)}
            onSaved={() => {
              pinStatusGeneration.current += 1;
              setPinStatusReload((value) => value + 1);
              setPinTest(null);
            }}
            onRemoved={() => {
              pinStatusGeneration.current += 1;
              setPinnedTestIds((prev) => {
                const next = new Set(prev);
                next.delete(pinTest.id);
                return next;
              });
              setPinStatusReload((value) => value + 1);
              setPinTest(null);
            }}
          />
        )}
        {confirmDelete && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setConfirmDelete(null)}
            />
            <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
                <p className="text-sm text-gray-700 mb-1 font-medium">
                  Testni o'chirish
                </p>
                <p className="text-sm text-gray-400 mb-5">
                  "{confirmDelete.name}" o'chirilsinmi? Bu amalni qaytarib
                  bo'lmaydi.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700"
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={handleDelete}
                    className="text-sm px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    O'chirish
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
