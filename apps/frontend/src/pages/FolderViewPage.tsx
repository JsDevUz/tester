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
        results.forEach((result, index) => {
          if (result.status === "rejected") return;
          const testId = tests[index].id;
          // "Has a pin" means a pin row exists for this test, regardless of
          // whether its scheduled window is currently active — this must
          // match TestPinModal's hasExistingPin semantics (apiGetTestPin
          // returning non-null), so the card highlight never disagrees with
          // what the pin modal itself shows when reopened.
          if (result.value) next.add(testId);
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

  // Periodically re-check pin status so the highlight self-corrects if a
  // pin is added/removed elsewhere, without requiring navigation away and
  // back. Matches the 60s polling cadence used for other "is this thing
  // currently active" checks (e.g. StudentShell's live-session polling).
  useEffect(() => {
    if (tests.length === 0) return;
    const timer = window.setInterval(() => {
      setPinStatusReload((value) => value + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [tests.length]);

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
                type="button"
                onClick={() => navigate("/")}
                className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                ← Papkalar
              </button>
              <span className="text-[var(--text-muted)] text-xs">/</span>
              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                {folder?.name ?? "Folder"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer"
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          >
            <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5">
              <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                Testni o'chirish
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                <span className="font-bold text-[var(--text-primary)]">"{confirmDelete.name}"</span> o'chirilsinmi? Bu amalni qaytarib
                bo'lmaydi.
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
