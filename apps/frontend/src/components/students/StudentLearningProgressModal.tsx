import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, ClipboardCheck, Clock3, ExternalLink, PlayCircle, Star, UserRound, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiGetStudentCourseProgress, type ApiStudentCourseProgress } from '../../api/school';
import { apiGradeImageSubmission, apiGradeOralPracticeBlock, apiGradeTestPracticeSubmission } from '../../api/practiceBlocks';

interface StudentLearningProgressModalProps {
  studentId: string;
  courseId: string;
  onClose: () => void;
}

type PracticeBlockProgress = ApiStudentCourseProgress['lessons'][number]['practiceBlocks'][number];

function formatDateTime(value: string | null) {
  if (!value) return "Hali faollik yo'q";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} | ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function StudentLearningProgressModal({ studentId, courseId, onClose }: StudentLearningProgressModalProps) {
  const [progress, setProgress] = useState<ApiStudentCourseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedPractice, setSelectedPractice] = useState<{ lessonTitle: string; practiceBlock: PracticeBlockProgress } | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{ imageUrl: string; submittedAt: string } | null>(null);
  const [scoreDraft, setScoreDraft] = useState('');
  const [editingGrade, setEditingGrade] = useState(false);
  const [editingTestSubmissionId, setEditingTestSubmissionId] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void apiGetStudentCourseProgress(studentId, courseId)
      .then((data) => { if (active) setProgress(data); })
      .catch((requestError: any) => {
        if (active) setError(requestError?.response?.data?.message ?? "Ma'lumotni yuklab bo'lmadi.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId, courseId, refreshVersion]);

  async function handleGradeImage(submissionId: string, maxScore: number | null) {
    const score = Number(scoreDraft);
    if (!Number.isInteger(score) || score < 0 || (maxScore !== null && score > maxScore)) {
      toast.error(maxScore === null ? "Yulduz miqdorini kiriting." : `Yulduz 0 dan ${maxScore} gacha bo‘lishi kerak.`);
      return;
    }
    setSavingGrade(true);
    try {
      await apiGradeImageSubmission(submissionId, score);
      setSelectedPractice(null);
      setScoreDraft('');
      setRefreshVersion((version) => version + 1);
    } catch (requestError: any) {
      toast.error(requestError?.response?.data?.message ?? "Bahoni saqlab bo‘lmadi.");
    } finally {
      setSavingGrade(false);
    }
  }

  async function handleGradeOralPractice() {
    if (!selectedPractice || selectedPractice.practiceBlock.type !== 'oral') return;
    const score = Number(scoreDraft);
    const maxScore = selectedPractice.practiceBlock.maxScore;
    if (!Number.isInteger(score) || score < 0 || (maxScore !== null && score > maxScore)) {
      toast.error(maxScore === null ? "Yulduz miqdorini kiriting." : `Yulduz 0 dan ${maxScore} gacha bo‘lishi kerak.`);
      return;
    }
    setSavingGrade(true);
    try {
      await apiGradeOralPracticeBlock(selectedPractice.practiceBlock.id, studentId, score);
      setSelectedPractice(null);
      setScoreDraft('');
      setRefreshVersion((version) => version + 1);
    } catch (requestError: any) {
      toast.error(requestError?.response?.data?.message ?? "Bahoni saqlab bo‘lmadi.");
    } finally {
      setSavingGrade(false);
    }
  }

  async function handleGradeTestPractice(submissionId: string) {
    if (!selectedPractice || selectedPractice.practiceBlock.type !== 'test') return;
    const score = Number(scoreDraft);
    const maxScore = selectedPractice.practiceBlock.maxScore;
    if (!Number.isInteger(score) || score < 0 || maxScore === null || score > maxScore) {
      toast.error(maxScore === null ? "Maksimal yulduz belgilanmagan." : `Yulduz 0 dan ${maxScore} gacha bo‘lishi kerak.`);
      return;
    }
    setSavingGrade(true);
    try {
      await apiGradeTestPracticeSubmission(submissionId, score);
      setEditingTestSubmissionId(null);
      setScoreDraft('');
      setSelectedPractice(null);
      setRefreshVersion((version) => version + 1);
      toast.success('Test amaliyoti yulduzi yangilandi');
    } catch (requestError: any) {
      toast.error(requestError?.response?.data?.message ?? "Yulduzni saqlab bo‘lmadi.");
    } finally {
      setSavingGrade(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" aria-modal="true" role="dialog" aria-label="O'quvchi o'zlashtirishi">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3.5 sm:px-5">
          {progress ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-600">
                {initials(progress.student.name)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">{progress.student.name}</h2>
                <p className="truncate text-[11px] text-gray-400">{progress.student.phone ?? '—'}</p>
              </div>
            </div>
          ) : <div />}
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700" aria-label="Yopish">
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-gray-400">O‘zlashtirish ma’lumotlari yuklanmoqda...</p>
          ) : error ? (
            <p className="py-16 text-center text-sm font-medium text-red-500">{error}</p>
          ) : progress ? (
            <>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Kurs / guruh</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-800">{progress.course.title}</p>
                    <p className="text-xs text-gray-500">{progress.course.groupName}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Oxirgi faollik</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-gray-700"><Clock3 size={13} style={{ color: 'var(--color-gray-900)' }} />{formatDateTime(progress.lastActivityAt)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-gray-600">Jarayon</span>
                  <span className="font-semibold text-[var(--color-gray-900)]">{progress.lessonsCompleted}/{progress.lessonsTotal} dars · {progress.progressPercent}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div className="student-progress-fill h-full rounded-full transition-[width]" style={{ width: `${progress.progressPercent}%` }} />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Darslar</p>
                    <p className="text-[11px] text-gray-400">Tamomlangan darslar, joriy dars va video ko‘rish tarixi</p>
                  </div>
                </div>
                {progress.lessons.length === 0 ? (
                  <div className="rounded-2xl bg-gray-50 py-10 text-center text-gray-400">
                    <UserRound size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Kursda hali nashr qilingan dars yo‘q</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {progress.lessons.map((lesson) => {
                      const isCompleted = lesson.status === 'completed';
                      const isCurrent = lesson.status === 'current';
                      return (
                        <div key={lesson.id} className={`rounded-xl border p-2.5 ${isCurrent ? 'bg-gray-50/60' : 'border-gray-100 bg-white'}`} style={isCurrent ? { borderColor: 'var(--color-gray-900)' } : undefined}>
                          <div className="flex items-start gap-2.5">
                            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isCompleted ? 'bg-green-50 text-green-500' : isCurrent ? 'bg-gray-200 text-[var(--color-gray-900)]' : 'bg-gray-100 text-gray-400'}`}>
                              {isCompleted ? <CheckCircle2 size={17} /> : isCurrent ? <PlayCircle size={17} /> : <CircleDashed size={17} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="text-xs font-medium text-gray-400">{lesson.moduleTitle}</p>
                                {isCurrent && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-[var(--color-gray-900)]">Hozir o‘rganmoqda</span>}
                              </div>
                              <p className="mt-0.5 text-sm font-semibold text-gray-800">{lesson.title}</p>
                              <p className={`mt-0.5 text-[11px] font-medium ${isCompleted ? 'text-green-600' : isCurrent ? 'text-[var(--color-gray-900)]' : 'text-gray-400'}`}>
                                {isCompleted ? `Tamomlangan · ${formatDateTime(lesson.completedAt)}` : isCurrent ? 'Jarayonda' : 'Boshlanmagan'}
                              </p>
                              {lesson.completionScore !== null && (
                                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500"><Star size={12} fill="currentColor" />Dars yakuni: {lesson.earnedCompletionScore ?? 0}/{lesson.completionScore}</p>
                              )}
                            </div>
                          </div>

                          {lesson.videoBlocks.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                              {lesson.videoBlocks.map((video) => (
                                <div key={video.id} className="rounded-lg bg-gray-50 px-2.5 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-700"><Video size={14} className="shrink-0" style={{ color: 'var(--color-gray-900)' }} /><span className="truncate">{video.label}</span></p>
                                    <span className="shrink-0 text-xs font-bold text-[var(--color-gray-900)]">{video.watchedPercent ?? 0}%</span>
                                  </div>
                                  {video.durationSec ? (
                                    <>
                                  <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
                                        {video.segments.map((segment, index) => (
                                          <span key={`${segment.startSec}-${segment.endSec}-${index}`} className="student-progress-fill absolute inset-y-0 rounded-full" style={{ left: `${(segment.startSec / video.durationSec!) * 100}%`, width: `${((segment.endSec - segment.startSec) / video.durationSec!) * 100}%` }} />
                                        ))}
                                      </div>
                                      <p className="mt-1 text-[10px] text-gray-400">
                                        {video.segments.length > 0
                                          ? video.segments.map((segment) => `${formatDuration(segment.startSec)}–${formatDuration(segment.endSec)}`).join(', ')
                                          : "Hali ko‘rilmagan"}
                                      </p>
                                    </>
                                  ) : <p className="mt-1 text-[11px] text-gray-400">Video davomiyligi aniqlanmagan</p>}
                                </div>
                              ))}
                            </div>
                          )}

                          {lesson.practiceBlocks.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                              <p className="text-[11px] font-semibold text-gray-500">Amaliyotlar</p>
                              {lesson.practiceBlocks.map((practiceBlock) => (
                                <button type="button" key={practiceBlock.id} onClick={() => { setSelectedPractice({ lessonTitle: lesson.title, practiceBlock }); setScoreDraft(''); setEditingGrade(false); setEditingTestSubmissionId(null); }} className="flex w-full items-center justify-between gap-3 rounded-lg bg-gray-50 px-2.5 py-2 text-left transition-colors hover:bg-gray-100">
                                  <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-gray-700"><ClipboardCheck size={13} className="shrink-0" style={{ color: 'var(--color-gray-900)' }} /><span className="truncate">{practiceBlock.title}</span></p>
                                  {practiceBlock.maxScore !== null ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-500"><Star size={12} fill="currentColor" />{practiceBlock.earnedScore ?? 0}/{practiceBlock.maxScore}</span>
                                  ) : <span className="shrink-0 text-[11px] font-medium text-gray-400">Yulduz belgilanmagan</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
      {selectedPractice && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/45 p-4" onClick={(event) => { if (event.target === event.currentTarget) setSelectedPractice(null); }}>
          <section className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6" aria-modal="true" role="dialog" aria-label="Amaliyot tafsilotlari">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-400">{selectedPractice.lessonTitle}</p>
                <h3 className="mt-0.5 text-base font-bold text-gray-900">{selectedPractice.practiceBlock.title}</h3>
              </div>
              <button type="button" onClick={() => setSelectedPractice(null)} className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100" aria-label="Yopish"><X size={18} /></button>
            </div>

            {selectedPractice.practiceBlock.type === 'image' ? (
              <div className="mt-5 space-y-4">
                {selectedPractice.practiceBlock.imageSubmissions.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">O‘quvchi hali rasm yubormagan.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {selectedPractice.practiceBlock.imageSubmissions.map((submission) => (
                      <button key={submission.id} type="button" onClick={() => setFullscreenImage({ imageUrl: submission.imageUrl, submittedAt: submission.submittedAt })} className="group overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 text-left transition hover:border-gray-300 hover:shadow-sm">
                        <img src={submission.imageUrl} alt="O‘quvchi yuborgan topshiriq" className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                        <span className="block truncate px-2.5 py-2 text-[11px] font-medium text-gray-400">{formatDateTime(submission.submittedAt)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl bg-gray-50 p-3.5">
                  <p className="text-xs font-bold text-gray-700">Barcha rasmlar uchun umumiy yulduz</p>
                  <p className="mt-1 text-[11px] text-gray-400">Bu baho shu topshiriqdagi barcha yuborilgan rasmlarga bir xil qo‘llanadi.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="text-xs font-bold text-gray-600">Yulduz</label>
                    {selectedPractice.practiceBlock.imageSubmissions[0]?.graded && !editingGrade ? (
                      <span className="text-sm font-bold text-green-600">{selectedPractice.practiceBlock.imageSubmissions[0].score ?? 0} / {selectedPractice.practiceBlock.maxScore ?? '—'}</span>
                    ) : (
                      <>
                        <input type="number" min={0} max={selectedPractice.practiceBlock.maxScore ?? undefined} value={scoreDraft} onChange={(event) => setScoreDraft(event.target.value)} placeholder={selectedPractice.practiceBlock.imageSubmissions[0]?.score?.toString() ?? selectedPractice.practiceBlock.maxScore?.toString() ?? 'Yulduz'} className="w-24 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none ring-1 ring-transparent focus:ring-gray-300" />
                        <span className="text-xs text-gray-400">/ {selectedPractice.practiceBlock.maxScore ?? '—'}</span>
                      </>
                    )}
                    {selectedPractice.practiceBlock.imageSubmissions[0]?.graded && !editingGrade ? (
                      <button type="button" onClick={() => { setScoreDraft(String(selectedPractice.practiceBlock.imageSubmissions[0].score ?? 0)); setEditingGrade(true); }} className="theme-primary-button ml-auto rounded-xl px-3.5 py-2 text-xs font-bold">O‘zgartirish</button>
                    ) : (
                      <button type="button" disabled={savingGrade} onClick={() => void handleGradeImage(selectedPractice.practiceBlock.imageSubmissions[0].id, selectedPractice.practiceBlock.maxScore)} className="theme-primary-button ml-auto rounded-xl px-3.5 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">{savingGrade ? 'Saqlanmoqda...' : editingGrade ? 'Saqlash' : 'Baholash'}</button>
                    )}
                  </div>
                </div>
              </div>
            ) : selectedPractice.practiceBlock.type === 'oral' ? (
              <div className="mt-5">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-800">Ustoz bilan jonli savol-javob</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">O‘quvchi bu yerga hech narsa yuklamaydi. Savol-javobdan keyin unga yulduzni shu yerda bering.</p>
                  {selectedPractice.practiceBlock.description && <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs text-gray-600">{selectedPractice.practiceBlock.description}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <label className="text-xs font-bold text-gray-600">Yulduz</label>
                    {selectedPractice.practiceBlock.oralGrade && !editingGrade ? (
                      <span className="text-sm font-bold text-green-600">{selectedPractice.practiceBlock.oralGrade.score} / {selectedPractice.practiceBlock.maxScore ?? '—'}</span>
                    ) : (
                      <>
                        <input type="number" min={0} max={selectedPractice.practiceBlock.maxScore ?? undefined} value={scoreDraft} onChange={(event) => setScoreDraft(event.target.value)} placeholder={selectedPractice.practiceBlock.oralGrade?.score?.toString() ?? selectedPractice.practiceBlock.maxScore?.toString() ?? 'Yulduz'} className="w-24 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none ring-1 ring-transparent focus:ring-gray-300" />
                        <span className="text-xs text-gray-400">/ {selectedPractice.practiceBlock.maxScore ?? '—'}</span>
                      </>
                    )}
                    {selectedPractice.practiceBlock.oralGrade && !editingGrade ? (
                      <button type="button" onClick={() => { setScoreDraft(String(selectedPractice.practiceBlock.oralGrade?.score ?? 0)); setEditingGrade(true); }} className="theme-primary-button ml-auto rounded-xl px-3.5 py-2 text-xs font-bold">O‘zgartirish</button>
                    ) : (
                      <button type="button" disabled={savingGrade} onClick={() => void handleGradeOralPractice()} className="theme-primary-button ml-auto rounded-xl px-3.5 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">{savingGrade ? 'Saqlanmoqda...' : editingGrade ? 'Saqlash' : 'Baholash'}</button>
                    )}
                  </div>
                  {selectedPractice.practiceBlock.oralGrade && !editingGrade && <p className="mt-3 text-[11px] font-medium text-gray-400">Baholangan: {formatDateTime(selectedPractice.practiceBlock.oralGrade.gradedAt)}</p>}
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {selectedPractice.practiceBlock.submissions.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">O‘quvchi bu testni hali ishlamagan.</p>
                ) : selectedPractice.practiceBlock.submissions.map((submission, index) => (
                  <div key={submission.id} className="rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">Urinish {selectedPractice.practiceBlock.submissions.length - index}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(submission.submittedAt)} · {submission.score}/{submission.total} to‘g‘ri</p>
                      </div>
                      <a href={`/submissions/${submission.id}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[var(--color-gray-900)] ring-1 ring-gray-200">Javoblar <ExternalLink size={13} /></a>
                    </div>
                    {selectedPractice.practiceBlock.maxScore !== null && (
                      editingTestSubmissionId === submission.id ? (
                        <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3">
                          <input type="number" min={0} max={selectedPractice.practiceBlock.maxScore} value={scoreDraft} onChange={(event) => setScoreDraft(event.target.value)} className="w-24 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none ring-1 ring-gray-200" />
                          <span className="text-xs text-gray-400">/ {selectedPractice.practiceBlock.maxScore}</span>
                          <button type="button" disabled={savingGrade} onClick={() => void handleGradeTestPractice(submission.id)} className="theme-primary-button ml-auto rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50">{savingGrade ? 'Saqlanmoqda...' : 'Saqlash'}</button>
                          <button type="button" onClick={() => { setEditingTestSubmissionId(null); setScoreDraft(''); }} className="rounded-xl px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100">Bekor qilish</button>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-500"><Star size={14} fill="currentColor" />{submission.earnedScore ?? 0}/{selectedPractice.practiceBlock.maxScore}</span>
                          {submission.scoreOverridden && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">Qo‘lda tahrirlangan</span>}
                          <button type="button" onClick={() => { setEditingTestSubmissionId(submission.id); setScoreDraft(String(submission.earnedScore ?? 0)); }} className="theme-primary-button ml-auto rounded-xl px-3.5 py-2 text-xs font-bold">O‘zgartirish</button>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {fullscreenImage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={(event) => { if (event.target === event.currentTarget) setFullscreenImage(null); }}>
          <div className="relative flex max-h-full max-w-full items-center justify-center">
            <img src={fullscreenImage.imageUrl} alt="O‘quvchi yuborgan topshiriq" className="max-h-[92dvh] max-w-[94vw] rounded-xl object-contain shadow-2xl" />
            <button type="button" onClick={() => setFullscreenImage(null)} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80" aria-label="Rasmni yopish"><X size={20} /></button>
            <p className="absolute -bottom-7 left-0 right-0 text-center text-xs font-medium text-white/75">{formatDateTime(fullscreenImage.submittedAt)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
