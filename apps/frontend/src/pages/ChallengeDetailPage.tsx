import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "../components/student/StudentShell";
import {
  apiGetMyChallengeDetail,
  apiAddChallengeEvent,
  apiGetMyChallengeLeaderboard,
  type ApiMyChallengeDetail,
  type ApiChallengeLeaderboardEntry,
  type ChallengeLeaderboardMetric,
} from "../api/challenges";

const METRICS: { key: ChallengeLeaderboardMetric; label: string }[] = [
  { key: "overall", label: "Umumiy" },
  { key: "books", label: "Kitoblar" },
  { key: "words", label: "Lug'at" },
  { key: "speed", label: "Tezlik" },
];

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ApiMyChallengeDetail | null>(null);
  const [tab, setTab] = useState<"books" | "leaderboard">("books");
  const [metric, setMetric] = useState<ChallengeLeaderboardMetric>("overall");
  const [entries, setEntries] = useState<ApiChallengeLeaderboardEntry[]>([]);
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [endPage, setEndPage] = useState("");
  const [newWords, setNewWords] = useState("");
  const [requiredTest, setRequiredTest] = useState<{ bookId: string; slug: string; name: string } | null>(null);

  useEffect(() => {
    if (id) void apiGetMyChallengeDetail(id).then(setDetail);
  }, [id]);

  useEffect(() => {
    if (id && tab === "leaderboard")
      void apiGetMyChallengeLeaderboard(id, metric).then((r) =>
        setEntries(r.entries),
      );
  }, [id, tab, metric]);

  if (!detail || !id)
    return (
      <StudentShell>
        <p className="p-6 text-sm text-gray-400">Yuklanmoqda...</p>
      </StudentShell>
    );

  async function handleSubmitEvent(bookId: string) {
    if (!id) return;
    const book = detail!.books.find((b) => b.id === bookId)!;
    if (book.pendingTest) {
      setRequiredTest({ bookId, slug: book.pendingTest.slug!, name: book.pendingTest.name });
      return;
    }
    const parsedEndPage = parseInt(endPage, 10);
    if (Number.isNaN(parsedEndPage)) {
      toast.error("Tugagan betni kiriting");
      return;
    }
    try {
      await apiAddChallengeEvent(id, bookId, {
        endPage: parsedEndPage,
        newWordsCount: parseInt(newWords || "0", 10),
      });
      const refreshed = await apiGetMyChallengeDetail(id);
      setDetail(refreshed);
      setAddingBookId(null);
      setEndPage("");
      setNewWords("");
      toast.success("Yozuv qo'shildi");
    } catch (error: any) {
      const requiredTestSlug = error?.response?.data?.requiredTestSlug;
      const requiredTestName = error?.response?.data?.requiredTestName;
      if (requiredTestSlug) {
        setRequiredTest({ bookId, slug: requiredTestSlug, name: requiredTestName ?? "" });
        return;
      }
      toast.error(error?.response?.data?.message ?? "Yozuv qo'shib bo'lmadi");
    }
  }

  return (
    <StudentShell>
      <div className="bg-white px-4 py-5 lg:rounded-2xl lg:p-5">
        <button
          type="button"
          onClick={() => navigate("/challenges")}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500"
        >
          <ArrowLeft size={16} /> Jamm
        </button>

        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">
          {detail.name}
        </h1>
        <p className="mb-6 text-sm text-gray-400">{detail.description}</p>

        <div className="student-course-card challenge-detail-card mb-4 flex gap-2 rounded-3xl p-2">
          <button
            type="button"
            onClick={() => setTab("books")}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "books" ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            Kitoblar
          </button>
          <button
            type="button"
            onClick={() => setTab("leaderboard")}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "leaderboard" ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            Reyting
          </button>
        </div>

        {tab === "books" ? (
          <div className="flex flex-col gap-3">
            {detail.books.map((book) => (
              <div
                key={book.id}
                className="student-course-card challenge-detail-card rounded-3xl p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-gray-800">{book.title}</p>
                  <p className="text-xs text-gray-400">
                    {book.lastPageRead}/{book.totalPages} bet
                  </p>
                </div>
                <div className="challenge-detail-input mb-3 h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${Math.min(100, (book.lastPageRead / (book.totalPages || 1)) * 100)}%`,
                    }}
                  />
                </div>

                {requiredTest?.bookId === book.id ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/t/${requiredTest.slug}`)}
                    className="w-full rounded-xl bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100"
                  >
                    <p className="text-xs font-semibold text-amber-700">
                      Test ishlash
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-600">
                      Davom etish uchun avval{requiredTest.name ? ` "${requiredTest.name}"` : ""} testini
                      yakunlang
                    </p>
                  </button>
                ) : addingBookId === book.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Boshlagan bet: {book.lastPageRead}</span>
                    </div>
                    <input
                      value={endPage}
                      onChange={(e) => setEndPage(e.target.value)}
                      type="number"
                      min={book.lastPageRead + 1}
                      placeholder="Tugagan bet"
                      className="challenge-detail-input rounded-xl px-3 py-2 text-sm outline-none ring-1 ring-transparent transition-colors focus:ring-indigo-400"
                    />
                    <input
                      value={newWords}
                      onChange={(e) => setNewWords(e.target.value)}
                      type="number"
                      min={0}
                      placeholder="Yangi lug'at soni"
                      className="challenge-detail-input rounded-xl px-3 py-2 text-sm outline-none ring-1 ring-transparent transition-colors focus:ring-indigo-400"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSubmitEvent(book.id)}
                        className="flex-1 rounded-xl bg-gray-900 py-2 text-xs font-semibold text-white"
                      >
                        Saqlash
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingBookId(null)}
                        className="challenge-detail-input rounded-xl px-3 py-2 text-xs font-semibold text-gray-600"
                      >
                        Bekor
                      </button>
                    </div>
                  </div>
                ) : book.pendingTest ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRequiredTest({ bookId: book.id, slug: book.pendingTest!.slug!, name: book.pendingTest!.name })
                    }
                    className="w-full rounded-xl bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100"
                  >
                    <p className="text-xs font-semibold text-amber-700">
                      Test ishlash
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-600">
                      Davom etish uchun avval "{book.pendingTest.name}" testini
                      yakunlang
                    </p>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingBookId(book.id)}
                    className="challenge-detail-input w-full rounded-xl py-2 text-xs font-semibold text-gray-700"
                  >
                    + Yangi yozuv
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="student-course-card challenge-detail-card rounded-3xl p-3">
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${metric === m.key ? "bg-gray-900 text-white" : "challenge-detail-input text-gray-500"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <div
                  key={entry.studentId}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${entry.isCurrentStudent ? "bg-indigo-50" : "challenge-detail-input"}`}
                >
                  <span className="w-6 text-center text-sm font-bold text-gray-500">
                    {entry.rank}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                    {entry.studentName}
                  </p>
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                    <Trophy size={12} /> {entry.value}
                  </span>
                </div>
              ))}
              {entries.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">
                  Hali reyting yo'q
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
