import { useEffect, useState } from "react";
import { apiStartSubmission, apiGetSubmission } from "../../api/delivery";
import { apiGetMe } from "../../api/auth";
import { useAuthStore } from "../../stores/authStore";

export interface TestTakerProps {
  slug: string;
  submissionId?: string;
  practiceMode: boolean;
  onNavigateResult: (submissionId: string) => void;
  onExit: () => void;
}

type Phase = "checking" | "starting" | "answering" | "result";

export function TestTaker({ slug, submissionId: initialSubmissionId, practiceMode, onNavigateResult, onExit: _onExit }: TestTakerProps) {
  const [phase, setPhase] = useState<Phase>(initialSubmissionId ? "checking" : "starting");
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const adminName = useAuthStore((s) => s.admin?.name ?? null);
  const token = useAuthStore((s) => s.token);

  function goToResult(sid: string) {
    setResolvedSubmissionId(sid);
    setPhase("result");
    onNavigateResult(sid);
  }

  // Determine starting phase: if a submissionId was passed in, check its
  // status first (mirrors TakeTestEntryPage.tsx:44-69 and the redirect
  // TakeTestPage.tsx:518-529 performs today).
  useEffect(() => {
    if (!initialSubmissionId) {
      setPhase("starting");
      return;
    }
    let cancelled = false;
    apiGetSubmission(initialSubmissionId, practiceMode)
      .then((sub) => {
        if (cancelled) return;
        if (sub.status === "submitted") {
          goToResult(initialSubmissionId);
        } else {
          setPhase("answering");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("starting");
        }
      });
    return () => { cancelled = true; };
  }, [initialSubmissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: falling back to "starting" here leaves resolvedSubmissionId holding
  // the stale invalid initialSubmissionId until the effect below overwrites it
  // with a freshly-started submission's id — resolvedSubmissionId is never read
  // while phase is "starting" (the loading-guard in Step 1 below returns early
  // for that phase), so this is safe.

  // Auto-start: resolve name and call apiStartSubmission, mirroring
  // TakeTestEntryPage.tsx:28-42 (name resolution) and :71-88 (start call),
  // but skipping the visible name-entry form per the practice-mode design.
  useEffect(() => {
    if (phase !== "starting") return;
    let cancelled = false;

    async function start() {
      let name = adminName;
      if (!name && token) {
        try {
          const me = await apiGetMe();
          name = me.name;
        } catch {
          // fall through to error below
        }
      }
      if (!name) {
        if (!cancelled) setStartError("Foydalanuvchi aniqlanmadi. Qaytadan kiring.");
        return;
      }
      try {
        const { submissionId: newId } = await apiStartSubmission(slug, name, practiceMode);
        if (cancelled) return;
        setResolvedSubmissionId(newId);
        setPhase("answering");
      } catch {
        if (!cancelled) setStartError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    }

    void start();
    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (startError) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-red-400 text-center text-sm">{startError}</p>
      </div>
    );
  }

  if (phase === "starting" || phase === "checking" || !resolvedSubmissionId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-3 border-indigo-200 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  if (phase === "result") {
    return <div>{/* Task 4 replaces this with TestResultView */}</div>;
  }

  // phase === "answering"
  return <div>{/* Task 3 replaces this with the question-answering UI */}</div>;
}
