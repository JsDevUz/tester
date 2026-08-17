import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, Star } from "lucide-react";
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
  type ChallengeTimeframe,
} from "../api/challenges";
import {
  apiGetMyChallengeWordLeaderboard,
  apiListMyChallengeWords,
  type ApiStudentChallengeWord,
} from "../api/challenge-words";

const TIMEFRAMES: { key: ChallengeTimeframe; label: string }[] = [
  { key: "all", label: "Umumiy" },
  { key: "daily", label: "Kunlik" },
  { key: "weekly", label: "Haftalik" },
  { key: "monthly", label: "Oylik" },
];

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ApiMyChallengeDetail | null>(null);
  const [tab, setTab] = useState<"books" | "leaderboard">("books");
  const [metric, setMetric] = useState<ChallengeLeaderboardMetric>("overall");
  const [timeframe, setTimeframe] = useState<ChallengeTimeframe>("all");
  const [selectedBookId, setSelectedBookId] = useState<string>("all");
  const [entries, setEntries] = useState<ApiChallengeLeaderboardEntry[]>([]);
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [endPage, setEndPage] = useState("");
  const [newWords, setNewWords] = useState("");
  const [requiredTestModal, setRequiredTestModal] = useState<{ bookId: string; slug: string; name: string } | null>(null);
  const [challengeWords, setChallengeWords] = useState<ApiStudentChallengeWord[]>([]);

  useEffect(() => {
    if (id) void apiGetMyChallengeDetail(id).then(setDetail);
  }, [id]);

  useEffect(() => {
    if (!id || tab !== "leaderboard" || !detail) return;
    const request = detail.type === "soz_yodlash"
      ? apiGetMyChallengeWordLeaderboard(id, timeframe)
      : apiGetMyChallengeLeaderboard(id, metric, timeframe, selectedBookId);
    void request.then((result) => setEntries(result.entries));
  }, [id, tab, metric, timeframe, selectedBookId, detail]);

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
      setRequiredTestModal({ bookId, slug: book.pendingTest.slug!, name: book.pendingTest.name });
      return;
    }
    const parsedEndPage = parseInt(endPage, 10);
    if (Number.isNaN(parsedEndPage) || parsedEndPage < 0) {
      toast.error("Tugagan betni to'g'ri kiriting");
      return;
    }
    if (book.totalPages && parsedEndPage > book.totalPages) {
      toast.error(`Tugagan bet kitobning jami sahifalari sonidan (${book.totalPages}) oshmasligi kerak`);
      return;
    }
    if (parsedEndPage <= book.lastPageRead) {
      if (!window.confirm(`Siz kitobni ${parsedEndPage}-betga qaytarmoqchimisiz?`)) {
        return;
      }
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
      toast.success("Yozuv saqlandi");
    } catch (error: any) {
      const requiredTestSlug = error?.response?.data?.requiredTestSlug;
      const requiredTestName = error?.response?.data?.requiredTestName;
      if (requiredTestSlug) {
        setRequiredTestModal({ bookId, slug: requiredTestSlug, name: requiredTestName ?? "Test" });
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
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-800 dark:text-zinc-100">So'zlar</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-400">{challengeWords.filter((word) => word.known).length}/{challengeWords.length} yodlangan</p>
                </div>
                <button type="button" onClick={() => navigate(`/challanges/${id}/practice`)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700">Mashq qilish</button>
              </div>
              {challengeWords.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[1fr_1fr_90px] items-center gap-2 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    <span>So'z</span>
                    <span>Tarjima</span>
                    <span className="text-right">Holat</span>
                  </div>
                  {challengeWords.map((word) => (
                    <div key={word.id} className="challenge-detail-input grid grid-cols-[1fr_1fr_90px] items-center gap-2 rounded-xl px-3 py-2.5">
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
            <div className="flex flex-col gap-2">
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

                  {addingBookId === book.id ? (
                    <div className="mt-3 flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-xl bg-gray-100/80 px-3 py-2 text-center text-xs font-bold text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400 border border-gray-200/60 dark:border-zinc-700/60">
                          {book.lastPageRead} - bet
                        </div>
                        <span className="text-sm font-extrabold text-gray-400 dark:text-zinc-500">-</span>
                        <input
                          value={endPage}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || /^\d+$/.test(val)) {
                              const num = parseInt(val, 10);
                              if (!num || !book.totalPages || num <= book.totalPages) {
                                setEndPage(val);
                              } else {
                                setEndPage(String(book.totalPages));
                              }
                            }
                          }}
                          type="number"
                          min={0}
                          max={book.totalPages}
                          placeholder="Tugagan bet"
                          className="challenge-detail-input flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold outline-none ring-1 ring-transparent transition-colors focus:ring-indigo-500 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
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
                          onClick={() => setAddingBookId(null)}
                          className="challenge-detail-input rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-zinc-400"
                        >
                          Bekor qilish
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSubmitEvent(book.id)}
                          className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                        >
                          Saqlash
                        </button>
                      </div>
                    </div>
                  ) : book.pendingTest ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRequiredTestModal({ bookId: book.id, slug: book.pendingTest!.slug!, name: book.pendingTest!.name })
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
          )) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 mb-1 sm:flex-nowrap">
              {/* Turi select (for Kitobxonlik: Umumiy / Kitob / Lug'at) */}
              {detail.type !== "soz_yodlash" && (
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as ChallengeLeaderboardMetric)}
                  className="challenge-detail-input rounded-xl px-3 py-2 text-xs font-bold text-gray-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="overall">Umumiy</option>
                  <option value="books">Kitob</option>
                  <option value="words">Lug'at</option>
                </select>
              )}

              {/* Timeframe select */}
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as ChallengeTimeframe)}
                className="challenge-detail-input rounded-xl px-3 py-2 text-xs font-bold text-gray-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {TIMEFRAMES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>

              {/* Book Name select */}
              {detail.type !== "soz_yodlash" && detail.books.length > 0 && (
                <select
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                  className="challenge-detail-input max-w-[160px] truncate rounded-xl px-3 py-2 text-xs font-bold text-gray-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">Barcha kitoblar</option>
                  {detail.books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

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
                    avatarSize: "h-11 w-12 sm:h-14 sm:w-14",
                    ring: "border-2 border-slate-200",
                  },
                  3: {
                    podium:
                      "h-16 sm:h-20 bg-orange-300 text-white text-xl font-black rounded-t-2xl shadow-md",
                    avatarBg: "bg-orange-400",
                    avatarSize: "h-11 w-11 sm:h-11 sm:w-12",
                    ring: "border-2 border-orange-300",
                  },
                };

                return (
                  <div className="flex flex-col gap-4">
                    {/* Top 3 Podium Container */}
                    <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-5 text-white shadow-xl">
                      <div className="mt-2 flex items-end justify-center gap-2 sm:gap-6">
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
                            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${entry.isCurrentStudent
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

      {requiredTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150" onClick={(e) => { if (e.target === e.currentTarget) setRequiredTestModal(null); }}>
          <div className="glass-card w-full max-w-md rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ClipboardCheck size={24} />
            </div>
            <h3 className="text-center text-base font-bold text-[var(--text-primary)] tracking-tight">
              Majburiy test mavjud
            </h3>
            <p className="mt-2 text-center text-xs leading-relaxed text-[var(--text-muted)] font-medium">
              Ushbu bet uchun {requiredTestModal.name ? `"${requiredTestModal.name}"` : ""} testi mavjud. Testni ishlasangiz, kiritilgan bet qabul qilinadi. Testni boshlaysizmi?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setRequiredTestModal(null)}
                className="flex-1 rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => {
                  const slug = requiredTestModal.slug;
                  setRequiredTestModal(null);
                  navigate(`/t/${slug}`);
                }}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Testni boshlash
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
