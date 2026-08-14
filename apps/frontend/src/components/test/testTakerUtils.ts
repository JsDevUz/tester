export const BACKEND =
  import.meta.env.VITE_API_URL?.replace("/api/v1", "") ??
  "http://localhost:3001";

export function mediaUrl(url: string) {
  return url.startsWith("http") ? url : `${BACKEND}${url}`;
}

export const ARABIC_RE = /[\u0600-\u06FF]/;

export function isArabicText(text: string) {
  return ARABIC_RE.test(text);
}

export const VIOLATION_REASON =
  "Taqiqlangan harakat aniqlanganligi sababli yakunlandi.";

export const draftKey = (submissionId: string) => `test-draft:${submissionId}`;

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  single: { label: "Yagona", cls: "bg-blue-100 text-blue-600" },
  multi: { label: "Ko'p tanlov", cls: "bg-purple-100 text-purple-600" },
  open: { label: "Ochiq", cls: "bg-gray-100 text-gray-500" },
  arrange: { label: "Gap tuzish", cls: "bg-amber-100 text-amber-600" },
  truefalse: { label: "To'g'ri/Noto'g'ri", cls: "bg-green-100 text-green-600" },
  reorder: { label: "Tartibga solish", cls: "bg-orange-100 text-orange-600" },
  matching: { label: "Moslashtirish", cls: "bg-teal-100 text-teal-600" },
  fillblank: { label: "Bo'sh joy", cls: "bg-pink-100 text-pink-600" },
  slider: { label: "Slider", cls: "bg-cyan-100 text-cyan-600" },
  droppin: { label: "Drop Pin", cls: "bg-lime-100 text-lime-600" },
};

export interface QuestionFeedback {
  isCorrect: boolean | null;
  correctAnswer?: string | null;
  correctOptionIds?: string[];
}

export interface TestTakerProps {
  slug: string;
  submissionId?: string;
  practiceMode: boolean;
  onNavigateResult: (submissionId: string) => void;
  onExit: () => void;
}

export type Phase = "checking" | "starting" | "answering" | "result";
