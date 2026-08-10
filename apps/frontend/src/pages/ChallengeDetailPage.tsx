import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "../components/student/StudentShell";
import { SegmentedControl } from "../components/student/SegmentedControl";
import { UserAvatar } from "../components/UserAvatar";
import {
  apiGetMyChallengeDetail,
  apiAddChallengeEvent,
  apiGetMyChallengeLeaderboard,
  type ApiMyChallengeDetail,
  type ApiChallengeLeaderboardEntry,
  type ChallengeLeaderboardMetric,
} from "../api/challenges";
import {
  apiGetMyChallengeWordLeaderboard,
  apiListMyChallengeWords,
  type ApiStudentChallengeWord,
} from "../api/challenge-words";

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
  const [challengeWords, setChallengeWords] = useState<ApiStudentChallengeWord[]>([]);

  useEffect(() => {
    if (id) void apiGetMyChallengeDetail(id).then(setDetail);
  }, [id]);

  useEffect(() => {
    if (!id || tab !== "leaderboard" || !detail) return;
    const request = detail.type === "soz_yodlash"
      ? apiGetMyChallengeWordLeaderboard(id)
      : apiGetMyChallengeLeaderboard(id, metric);
    void request.then((result) => setEntries(result.entries));
  }, [id, tab, metric, detail]);

  useEffect(() => {
    if (id && detail?.type === "soz_yodlash")
      void apiListMyChallengeWords(id)
        .then(setChallengeWords)
        .catch(() => toast.error("So'zlarni yuklab bo'lmadi"));
  }, [id, detail?.type]);

  if (!detail || !id)
    return (
      <StudentShell>
        <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-5">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
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
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-5">
        <button
          type="button"
          onClick={() => navigate("/challanges")}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500"
        >
          <ArrowLeft size={16} /> Jamm
        </button>

        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">
          {detail.name}
        </h1>
        <p className="mb-6 text-sm text-gray-400">{detail.description}</p>

        <SegmentedControl
          value={tab}
          onChange={setTab}
          className="mb-4"
          options={[
            { value: "books", label: detail.type === "soz_yodlash" ? "So'zlar" : "Kitoblar" },
            { value: "leaderboard", label: "Reyting" },
          ]}
        />

        {tab === "books" ? (
          detail.type === "soz_yodlash" ? (
            <div className="student-course-card challenge-detail-card rounded-3xl p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-800 dark:text-zinc-100">So'zlar</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-400">{challengeWords.filter((word) => word.known).length}/{challengeWords.length} yodlangan</p>
                </div>
                <button type="button" onClick={() => navigate(`/challanges/${id}/practice`)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700">Mashq qilish</button>
              </div>
              {challengeWords.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[1fr_1fr_90px] items-center gap-3 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    <span>So'z</span>
                    <span>Tarjima</span>
                    <span className="text-right">Holat</span>
                  </div>
                  {challengeWords.map((word) => (
                    <div key={word.id} className="challenge-detail-input grid grid-cols-[1fr_1fr_90px] items-center gap-3 rounded-xl px-3 py-2.5">
                      <span className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">{word.word}</span>
                      <span className="truncate text-sm text-gray-500 dark:text-zinc-400">{word.translation}</span>
                      <span className={`text-right text-xs font-bold ${word.known ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-zinc-500"}`}>{word.known ? "Bilaman" : "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-400">Hali so'z yo'q</p>
              )}
            </div>
          ) : (
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
                      className="challenge-detail-input rounded-xl px-3 py-2 text-sm outline-none ring-1 ring-transparent transition-colors focus:ring-indigo-500 dark:bg-zinc-800 dark:text-white"
                    />
                    <input
                      value={newWords}
                      onChange={(e) => setNewWords(e.target.value)}
                      type="number"
                      min={0}
                      placeholder="Yangi lug'at soni"
                      className="challenge-detail-input rounded-xl px-3 py-2 text-sm outline-none ring-1 ring-transparent transition-colors focus:ring-indigo-500 dark:bg-zinc-800 dark:text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSubmitEvent(book.id)}
                        className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
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
                    className="w-full rounded-xl bg-indigo-50/80 py-2.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                  >
                    + Yangi yozuv
                  </button>
                )}
              </div>
            ))}
          </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {detail.type !== "soz_yodlash" && (
              <div className="flex gap-2 overflow-x-auto">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetric(m.key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      metric === m.key
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "challenge-detail-input text-gray-500"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {entries.length === 0 ? (
              <div className="student-course-card challenge-detail-card rounded-3xl p-8 text-center text-sm text-gray-400">
                Hali reyting yo'q
              </div>
            ) : (
              (() => {
                const topThree = entries.slice(0, 3);
                const remaining = entries.slice(3);
                const podiumOrder =
                  topThree.length > 1
                    ? [topThree[1], topThree[0], topThree[2]].filter(Boolean)
                    : topThree;

                const rankStyles: Record<
                  number,
                  {
                    podium: string;
                    avatarBg: string;
                    avatarSize: string;
                    ring: string;
                  }
                > = {
                  1: {
                    podium:
                      "h-28 sm:h-32 bg-amber-400 text-white text-3xl font-black rounded-t-2xl shadow-md",
                    avatarBg: "bg-amber-400",
                    avatarSize: "h-14 w-14 sm:h-16 sm:w-16",
                    ring: "border-2 border-amber-300 ring-4 ring-amber-400/30",
                  },
                  2: {
                    podium:
                      "h-20 sm:h-24 bg-slate-300 text-white text-2xl font-black rounded-t-2xl shadow-md",
                    avatarBg: "bg-slate-400",
                    avatarSize: "h-12 w-12 sm:h-14 sm:w-14",
                    ring: "border-2 border-slate-200",
                  },
                  3: {
                    podium:
                      "h-16 sm:h-20 bg-orange-300 text-white text-xl font-black rounded-t-2xl shadow-md",
                    avatarBg: "bg-orange-400",
                    avatarSize: "h-11 w-11 sm:h-12 sm:w-12",
                    ring: "border-2 border-orange-300",
                  },
                };

                return (
                  <div className="flex flex-col gap-4">
                    {/* Top 3 Podium Container */}
                    <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-5 text-white shadow-xl">
                      <div className="mt-2 flex items-end justify-center gap-3 sm:gap-6">
                        {podiumOrder.map((entry) => {
                          const style =
                            rankStyles[entry.rank] ?? rankStyles[3];
                          return (
                            <div
                              key={entry.studentId}
                              className="flex w-1/3 max-w-[130px] flex-col items-center"
                            >
                              <div className="relative mb-2">
                                <UserAvatar
                                  name={entry.studentName}
                                  avatarUrl={entry.studentAvatarUrl}
                                  className={`${style.avatarSize} rounded-full text-sm font-bold text-white shadow-lg ${style.ring} ${style.avatarBg}`}
                                />
                                <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-extrabold text-gray-900 shadow">
                                  {entry.rank}
                                </span>
                              </div>
                              <p className="w-full truncate text-center text-xs font-bold text-white">
                                {entry.studentName}
                              </p>
                              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-extrabold text-amber-200 backdrop-blur-xs">
                                <Star
                                  size={12}
                                  className="fill-amber-300 text-amber-300"
                                />{" "}
                                {entry.value}
                              </p>
                              <div
                                className={`mt-3 flex w-full items-center justify-center ${style.podium}`}
                              >
                                {entry.rank}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4-o'rindan boshlab ro'yxat */}
                    {remaining.length > 0 ? (
                      <div className="student-course-card challenge-detail-card flex flex-col gap-2 rounded-3xl p-3">
                        {remaining.map((entry) => (
                          <div
                            key={entry.studentId}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                              entry.isCurrentStudent
                                ? "bg-indigo-50 dark:bg-indigo-950/40"
                                : "challenge-detail-input"
                            }`}
                          >
                            <span className="w-6 text-center text-sm font-bold text-gray-500">
                              {entry.rank}
                            </span>
                            <UserAvatar
                              name={entry.studentName}
                              avatarUrl={entry.studentAvatarUrl}
                              className="h-8 w-8 rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-zinc-700 dark:text-zinc-200"
                            />
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
                              {entry.studentName}
                              {entry.isCurrentStudent && (
                                <span className="ml-1 text-xs text-indigo-600 dark:text-indigo-400">
                                  (Siz)
                                </span>
                              )}
                            </p>
                            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
                              <Star
                                size={12}
                                className="fill-amber-400 text-amber-400"
                              />{" "}
                              {entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
