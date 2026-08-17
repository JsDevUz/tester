import { useEffect, useState } from 'react';
import { BookOpen, ImagePlus, Inbox, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { useChallengeStore } from '../../stores/challengeStore';
import { apiUploadMedia } from '../../api/questions';
import { apiListMyTests, type MyTestSummary } from '../../api/tests';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import type { ApiChallengeBook } from '../../api/challenges';
import { CourseChallengeWordsPanel } from './CourseChallengeWordsPanel';

interface CourseChallengesPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectLaunch: () => void;
  onSelectGroups: () => void;
  onSelectClasses: () => void;
}

export function CourseChallengesPage({
  courseId, onBackToList, onSelectContent, onSelectSettings, onSelectLaunch, onSelectGroups, onSelectClasses,
}: CourseChallengesPageProps) {
  const { courses } = useCourseStore();
  const {
    challengesByCourse, detail, loadChallenges, createChallenge, loadChallengeDetail,
    deleteChallenge, addBook, deleteBook, setBookTest, removeBookTest,
  } = useChallengeStore();
  const course = courses.find((c) => c.id === courseId);
  const challenges = challengesByCourse[courseId] ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allTests, setAllTests] = useState<MyTestSummary[]>([]);

  useEffect(() => { void loadChallenges(courseId); }, [courseId, loadChallenges]);
  useEffect(() => { if (selectedId) void loadChallengeDetail(selectedId); }, [selectedId, loadChallengeDetail]);
  useEffect(() => { void apiListMyTests().then(setAllTests).catch(() => undefined); }, []);

  if (!course) return null;

  async function handleCreate(name: string, description: string, imageUrl: string, type: string) {
    try {
      const challenge = await createChallenge(courseId, { name, description, imageUrl, type });
      setCreating(false);
      setSelectedId(challenge.id);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Challenge yaratib bo'lmadi");
    }
  }

  if (selectedId && detail && detail.id === selectedId) {
    return (
      <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-3">
          <div className="px-1 py-1">
            <Breadcrumb
              items={[
                { label: 'Kurslar', onClick: onBackToList },
                { label: course.title, onClick: onSelectContent },
                { label: 'Challenges', onClick: () => setSelectedId(null) },
                { label: detail.name },
              ]}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row items-start">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">{detail.name}</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail.description || 'Tavsif kiritilmagan'}</p>
              </div>

              {detail.type === 'soz_yodlash' ? (
                <CourseChallengeWordsPanel challengeId={detail.id} />
              ) : (
                <BooksPanel
                  books={detail.books}
                  allTests={allTests}
                  onAddBook={(title, totalPages) => void addBook(detail.id, { title, totalPages })}
                  onDeleteBook={(bookId) => void deleteBook(detail.id, bookId)}
                  onSetTest={(bookId, data) => void setBookTest(detail.id, bookId, data)}
                  onRemoveTest={(bookId) => void removeBookTest(detail.id, bookId)}
                />
              )}

              <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer"
                >
                  <Trash2 size={15} /> Challenge-ni o'chirish
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="w-full rounded-2xl bg-[var(--surface-bg)] py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
              >
                Challenges-ga qaytish
              </button>
            </div>

            <CourseSidePanel
              onBackToList={onBackToList}
              activeFullTab="challenges"
              onSelectContent={onSelectContent}
              onSelectSettings={onSelectSettings}
              onSelectLaunch={onSelectLaunch}
              onSelectGroups={onSelectGroups}
              onSelectClasses={onSelectClasses}
              onSelectChallenges={() => { }}
            />
          </div>

          {confirmDelete && (
            <ConfirmDeleteModal
              title="Challenge-ni o'chirish"
              description={`"${detail.name}" o'chiriladi. Barcha kitoblar va o'quvchi tarixi ham yo'qoladi.`}
              onConfirm={() => {
                void deleteChallenge(courseId, detail.id);
                setSelectedId(null);
                setConfirmDelete(false);
              }}
              onClose={() => setConfirmDelete(false)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb items={[{ label: 'Kurslar', onClick: onBackToList }, { label: course.title, onClick: onSelectContent }, { label: 'Challenges' }]} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Challenges</h2>
              <p className="mt-0.5 mb-3.5 text-xs text-[var(--text-muted)]">Kitobxonlik challenge yarating, o'quvchilar avtomatik ko'radi</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
              >
                <Plus size={15} /> Yangi challenge
              </button>
            </div>

            {challenges.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-[var(--text-muted)] shadow-xs">
                <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">Hali challenge yo'q</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {challenges.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface-bg)] p-4 text-left shadow-xs transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                  >
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-11 w-12 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--card-bg)]">
                        <BookOpen size={20} className="text-[var(--text-muted)]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[var(--text-primary)]">{c.name}</p>
                      <p className="truncate text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{c.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <CourseSidePanel
            onBackToList={onBackToList}
            activeFullTab="challenges"
            onSelectContent={onSelectContent}
            onSelectSettings={onSelectSettings}
            onSelectLaunch={onSelectLaunch}
            onSelectGroups={onSelectGroups}
            onSelectClasses={onSelectClasses}
            onSelectChallenges={() => { }}
          />
        </div>
      </div>

      {creating && <CreateChallengeModal onCreate={handleCreate} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateChallengeModal({ onCreate, onClose }: { onCreate: (name: string, description: string, imageUrl: string, type: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [type, setType] = useState('kitobxonlik');
  const [uploading, setUploading] = useState(false);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await apiUploadMedia(file, 'avatars');
      setImageUrl(url);
    } catch {
      toast.error("Rasmni yuklab bo'lmadi");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xs bg-black/25 dark:bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl text-[var(--text-primary)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Yangi challenge</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Turi</label>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="mb-4 w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
        >
          <option value="kitobxonlik">Kitobxonlik</option>
          <option value="soz_yodlash">So'z yodlash</option>
        </select>

        <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Nomi</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          placeholder="Yoz mutolaasi 2026"
        />

        <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Tavsif</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-4 w-full resize-none rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          rows={3}
          placeholder="Challenge haqida qisqacha..."
        />

        <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Rasm</label>
        <label className="mb-5 flex h-24 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : <ImagePlus size={22} />}
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={uploading} />
        </label>

        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim(), description.trim(), imageUrl, type)}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
        >
          Yaratish
        </button>
      </div>
    </div>
  );
}

function BooksPanel({
  books, allTests, onAddBook, onDeleteBook, onSetTest, onRemoveTest,
}: {
  books: ApiChallengeBook[];
  allTests: MyTestSummary[];
  onAddBook: (title: string, totalPages: number) => void;
  onDeleteBook: (bookId: string) => void;
  onSetTest: (bookId: string, data: { testId: string; triggerPage?: number; forceNow?: boolean }) => void;
  onRemoveTest: (bookId: string) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newPages, setNewPages] = useState('');

  return (
    <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
      <h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Kitoblar</h3>

      <div className="mb-4 flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Kitob nomi"
          className="flex-1 rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        <input
          value={newPages}
          onChange={(e) => setNewPages(e.target.value)}
          placeholder="Jami bet"
          type="number"
          min={1}
          className="w-24 rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        <button
          type="button"
          disabled={!newTitle.trim() || !newPages}
          onClick={() => { onAddBook(newTitle.trim(), parseInt(newPages, 10)); setNewTitle(''); setNewPages(''); }}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
        >
          Qo'shish
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {books.map((book) => (
          <div key={book.id} className="rounded-xl bg-[var(--card-bg)] p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[var(--text-primary)]">{book.title}</p>
                <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{book.totalPages} bet</p>
              </div>
              <button
                type="button"
                onClick={() => onDeleteBook(book.id)}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <BookTestRow book={book} allTests={allTests} onSetTest={onSetTest} onRemoveTest={onRemoveTest} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BookTestRow({
  book, allTests, onSetTest, onRemoveTest,
}: {
  book: ApiChallengeBook;
  allTests: MyTestSummary[];
  onSetTest: (bookId: string, data: { testId: string; triggerPage?: number; forceNow?: boolean }) => void;
  onRemoveTest: (bookId: string) => void;
}) {
  const [testId, setTestId] = useState(book.test?.testId ?? '');
  const [triggerPage, setTriggerPage] = useState(book.test?.triggerPage?.toString() ?? '');
  const [forceNow, setForceNow] = useState(book.test?.forceNow ?? false);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] pt-2.5">
      <select
        value={testId}
        onChange={(e) => setTestId(e.target.value)}
        className="min-w-0 flex-1 rounded-xl bg-[var(--surface-bg)] py-1.5 px-2.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
      >
        <option value="">Test tanlang...</option>
        {allTests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <input
        value={triggerPage}
        onChange={(e) => setTriggerPage(e.target.value)}
        disabled={forceNow}
        placeholder="Bet"
        type="number"
        min={1}
        className="w-18 rounded-xl bg-[var(--surface-bg)] py-1.5 px-2.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-40 transition-colors"
      />
      <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={forceNow}
          onChange={(e) => setForceNow(e.target.checked)}
          className="h-3.5 w-3.5 rounded text-indigo-600 cursor-pointer"
        />
        Hozir majburiy
      </label>
      <button
        type="button"
        disabled={!testId}
        onClick={() => onSetTest(book.id, { testId, triggerPage: triggerPage ? parseInt(triggerPage, 10) : undefined, forceNow })}
        className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
      >
        Saqlash
      </button>
      {book.test && (
        <button
          type="button"
          onClick={() => onRemoveTest(book.id)}
          className="rounded-xl bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer"
        >
          Bekor qilish
        </button>
      )}
    </div>
  );
}
