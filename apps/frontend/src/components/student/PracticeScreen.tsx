import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ImagePlus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiMyLesson, ApiMyPracticeBlock } from '../../api/groups';
import { apiUploadMedia } from '../../api/questions';
import { apiDeletePracticeImageSubmission, apiSubmitPracticeImage } from '../../api/practiceBlocks';

interface PracticeScreenProps {
  lesson: ApiMyLesson;
  onBack: () => void;
  onStartPractice: (block: ApiMyPracticeBlock) => void;
  onViewSubmission: (block: ApiMyPracticeBlock, submissionId: string) => void;
  onImageSubmitted: () => void;
  hasNext: boolean;
  canComplete: boolean;
  onNext: () => void;
}

function ImagePracticeBlockCard({
  block,
  onImageSubmitted,
}: {
  block: ApiMyPracticeBlock;
  onImageSubmitted: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const maximumReached = block.imageSubmissions.length >= 5;
  const hasGradedSubmission = block.imageSubmissions.some((submission) => submission.graded);

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (maximumReached) {
      toast.error('Bitta topshiriqqa maksimal 5 ta rasm yuklash mumkin.');
      return;
    }
    if (hasGradedSubmission) {
      toast.error('Baholangan topshiriqqa yangi rasm yuklab bo‘lmaydi.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await apiUploadMedia(file, 'practice-submissions');
      await apiSubmitPracticeImage(block.id, uploaded.url);
      onImageSubmitted();
    } catch (requestError: any) {
      toast.error(requestError?.response?.data?.message ?? "Rasm yuklashda xatolik yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(submissionId: string) {
    setDeletingId(submissionId);
    try {
      await apiDeletePracticeImageSubmission(submissionId);
      onImageSubmitted();
    } catch (requestError: any) {
      toast.error(requestError?.response?.data?.message ?? "Rasmni o‘chirib bo‘lmadi. Qayta urinib ko'ring.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {block.description && (
        <p className="mb-3 text-sm text-gray-600">{block.description}</p>
      )}

      {block.imageSubmissions.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-gray-500">Sizning yuklamalaringiz</p>
          {block.imageSubmissions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
              <div className="min-w-0">
                <a href={s.imageUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-gray-800 hover:underline">
                  {new Date(s.submittedAt).toLocaleDateString('uz-UZ')}
                </a>
                <p className="text-[11px] text-gray-400">
                  {s.graded ? `Baholandi: ${s.score}${block.maxScore !== null ? ` / ${block.maxScore}` : ''}` : "Ustoz tekshiruvini kutmoqda"}
                </p>
              </div>
              {!s.graded && (
                <button type="button" onClick={() => void handleDeleteImage(s.id)} disabled={deletingId === s.id} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50" aria-label="Rasmni o‘chirish">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mb-2 text-right text-[11px] font-semibold text-gray-400">{block.imageSubmissions.length}/5 rasm</p>
      <label className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white ${maximumReached || hasGradedSubmission || uploading ? 'cursor-not-allowed bg-gray-300' : 'cursor-pointer bg-[var(--color-indigo-500)]'}`}>
        <input type="file" accept="image/*" className="hidden" disabled={uploading || maximumReached || hasGradedSubmission} onChange={handlePickFile} />
        <ImagePlus size={15} />
        {uploading ? 'Yuklanmoqda...' : maximumReached ? '5 ta rasm yuklandi' : hasGradedSubmission ? 'Topshiriq baholangan' : 'Rasm yuklash'}
      </label>
    </>
  );
}

function practiceMaxScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
}

function practiceEarnedScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
}

export function PracticeScreen({ lesson, onBack, onStartPractice, onViewSubmission, onImageSubmitted, hasNext, canComplete, onNext }: PracticeScreenProps) {
  const hasCompletionScore = lesson.completionScore !== null;
  const hasPracticeScore = lesson.practiceBlocks.some((b) => b.maxScore !== null);
  const totalMax = practiceMaxScore(lesson) + (lesson.completionScore ?? 0);
  const totalEarned = practiceEarnedScore(lesson) + (lesson.completed ? (lesson.completionScore ?? 0) : 0);

  return (
    <article className="mx-auto w-full max-w-3xl pb-12">
      <h1 className="mb-4 text-3xl font-black text-gray-950">Amaliy qism</h1>

      {totalMax > 0 && (
        <div className="mb-6 rounded-2xl bg-gray-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-500">
              <Star size={13} fill="currentColor" /> {totalEarned} / {totalMax}
            </span>
            <span className="text-xs font-semibold text-gray-500">Dars uchun yulduzlar yig'ildi</span>
          </div>
          <div className="flex flex-col gap-2">
            {hasPracticeScore && (
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-semibold">
                <span className="text-gray-600">Amaliyot</span>
                <span className="text-amber-500">{practiceEarnedScore(lesson)} / {practiceMaxScore(lesson)}</span>
              </div>
            )}
            {hasCompletionScore && (
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-semibold">
                <span className="text-gray-600">Darsni tamomlash</span>
                <span className="text-amber-500">{lesson.completed ? lesson.completionScore : 0} / {lesson.completionScore}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {lesson.practiceBlocks.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 py-16 text-center text-gray-400">
          <p className="text-sm font-semibold">Bu darsda amaliyot topshiriqlari yo'q</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {lesson.practiceBlocks.map((block) => (
            <div key={block.id} className="rounded-2xl bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-900">
                  {block.type === 'image' ? 'Amaliyot topshirig\'i' : block.type === 'oral' ? 'Jonli savol-javob' : (block.testName ?? 'Test tanlanmagan')}
                </p>
                {block.maxScore !== null && (
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-500">
                    {block.earnedScore ?? 0} / {block.maxScore}
                  </span>
                )}
              </div>

              {block.type === 'image' ? (
                <ImagePracticeBlockCard block={block} onImageSubmitted={onImageSubmitted} />
              ) : block.type === 'oral' ? (
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-gray-500">
                  <p className="font-semibold text-gray-700">Ustoz bilan jonli savol-javob</p>
                  <p className="mt-1 text-xs">Bu topshiriqda fayl yuklanmaydi. Ustoz suhbatdan so‘ng yulduzingizni qo‘lda belgilaydi.</p>
                  {block.oralGrade && <p className="mt-2 text-xs font-bold text-green-600">Baholandi: {block.oralGrade.score}/{block.maxScore ?? '—'}</p>}
                </div>
              ) : (
                <>
                  {block.submissions.length > 0 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-xs font-bold text-gray-500">Sizning natijalaringiz</p>
                      {block.submissions.map((s, i) => (
                        <div key={s.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800">
                              Urinish {block.submissions.length - i} <span className="font-normal text-gray-400">• {s.score}/{s.total}</span>
                            </p>
                            <p className="text-[11px] text-gray-400">{new Date(s.submittedAt).toLocaleDateString('uz-UZ')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onViewSubmission(block, s.id)}
                            className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600"
                          >
                            Ochish
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {block.testSlug ? (
                    block.attemptsRemaining === 0 ? (
                      <p className="text-center text-xs font-semibold text-gray-400">
                        Urinishlar soni tugadi
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onStartPractice(block)}
                          className="w-full rounded-xl bg-[var(--color-indigo-500)] py-2.5 text-xs font-bold text-white"
                        >
                          Qayta o'tish
                        </button>
                        {block.attemptsRemaining !== null && (
                          <p className="mt-1.5 text-center text-[11px] text-gray-400">
                            {block.attemptsRemaining} ta urinish imkoniyati qoldi
                          </p>
                        )}
                      </>
                    )
                  ) : (
                    <p className="text-xs font-semibold text-gray-400">Bu topshiriq hali tayyor emas</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {lesson.completed && (
        <div className="mt-6 flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-600">
          <CheckCircle2 size={18} /> Dars tamomlangan
        </div>
      )}

      {!lesson.completed && !canComplete && (
        <p className="mt-6 text-center text-xs font-semibold text-red-500">
          Darsni tamomlash uchun o'tish balidan yetarlicha ball to'plang
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
          <ChevronLeft size={15} /> Darsga qaytish
        </button>
        {hasNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={!lesson.completed && !canComplete}
            className="rounded-lg bg-[var(--color-indigo-500)] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
          >
            Keyingi darsga o'tish
          </button>
        )}
      </div>
    </article>
  );
}
