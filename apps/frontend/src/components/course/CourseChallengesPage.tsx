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
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Challenges', onClick: () => setSelectedId(null) },
              { label: detail.name },
            ]}
          />

          <div className="mb-4 rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">{detail.name}</h2>
            <p className="text-sm text-gray-400">{detail.description || 'Tavsif kiritilmagan'}</p>
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

          <div className="mt-4 rounded-2xl bg-white p-5">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 size={16} /> Challenge-ni o'chirish
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mt-4 w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
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
          onSelectChallenges={() => {}}
        />

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
    );
  }

  return (
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb items={[{ label: 'Kurslar', onClick: onBackToList }, { label: course.title, onClick: onSelectContent }, { label: 'Challenges' }]} />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Challenges</h2>
          <p className="mb-4 text-sm text-gray-400">Kitobxonlik challenge yarating, o'quvchilar avtomatik ko'radi</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
          >
            <Plus size={16} /> Yangi challenge
          </button>
        </div>

        {challenges.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali challenge yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {challenges.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left transition-colors hover:bg-gray-50"
              >
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                    <BookOpen size={20} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-gray-800">{c.name}</p>
                  <p className="truncate text-xs text-gray-400">{c.type}</p>
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
        onSelectChallenges={() => {}}
      />

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">Yangi challenge</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1.5 block text-sm text-gray-500">Turi</label>
        <select value={type} onChange={(event) => setType(event.target.value)} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-500 outline-none">
          <option value="kitobxonlik">Kitobxonlik</option>
          <option value="soz_yodlash">So'z yodlash</option>
        </select>

        <label className="mb-1.5 block text-sm text-gray-500">Nomi</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" placeholder="Yoz mutolaasi 2026" />

        <label className="mb-1.5 block text-sm text-gray-500">Tavsif</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" rows={3} />

        <label className="mb-1.5 block text-sm text-gray-500">Rasm</label>
        <label className="mb-4 flex h-24 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">
          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : <ImagePlus size={22} />}
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={uploading} />
        </label>

        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim(), description.trim(), imageUrl, type)}
          className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200"
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
    <div className="rounded-2xl bg-white p-5">
      <h3 className="mb-4 text-base font-bold text-gray-800">Kitoblar</h3>

      <div className="mb-4 flex gap-2">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Kitob nomi" className="flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <input value={newPages} onChange={(e) => setNewPages(e.target.value)} placeholder="Jami bet" type="number" min={1} className="w-28 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <button
          type="button"
          disabled={!newTitle.trim() || !newPages}
          onClick={() => { onAddBook(newTitle.trim(), parseInt(newPages, 10)); setNewTitle(''); setNewPages(''); }}
          className="shrink-0 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
        >
          Qo'shish
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {books.map((book) => (
          <div key={book.id} className="rounded-xl bg-gray-50 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">{book.title}</p>
                <p className="text-xs text-gray-400">{book.totalPages} bet</p>
              </div>
              <button type="button" onClick={() => onDeleteBook(book.id)} className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={15} />
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
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
      <select value={testId} onChange={(e) => setTestId(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-xs outline-none">
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
        className="w-20 rounded-xl bg-white px-3 py-2 text-xs outline-none disabled:opacity-40"
      />
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        <input type="checkbox" checked={forceNow} onChange={(e) => setForceNow(e.target.checked)} />
        Hozir majburiy
      </label>
      <button
        type="button"
        disabled={!testId}
        onClick={() => onSetTest(book.id, { testId, triggerPage: forceNow ? undefined : (parseInt(triggerPage, 10) || undefined), forceNow })}
        className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
      >
        Saqlash
      </button>
      {book.test && (
        <button type="button" onClick={() => onRemoveTest(book.id)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          Olib tashlash
        </button>
      )}
    </div>
  );
}
