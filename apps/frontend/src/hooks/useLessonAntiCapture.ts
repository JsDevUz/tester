import { useEffect } from "react";

export function pauseLessonVideos() {
  document.querySelectorAll("video").forEach((video) => {
    video.pause();
  });
}

export function useLessonAntiCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;

    const prevent = (event: Event) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;
      const isScreenshotCombo =
        event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key);
      const isDevToolsCombo =
        event.key === "F12" ||
        (hasModifier && event.shiftKey && ["i", "j", "c"].includes(key));
      const isBlockedShortcut =
        hasModifier && ["p", "s", "u", "c"].includes(key);

      if (event.key === "PrintScreen") {
        event.preventDefault();
        pauseLessonVideos();
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("").catch(() => undefined);
        }
        return;
      }

      if (isScreenshotCombo || isDevToolsCombo || isBlockedShortcut) {
        event.preventDefault();
        pauseLessonVideos();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) pauseLessonVideos();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", pauseLessonVideos);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("paste", prevent);
    document.addEventListener("dragstart", prevent);
    document.addEventListener("selectstart", prevent);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", pauseLessonVideos);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("paste", prevent);
      document.removeEventListener("dragstart", prevent);
      document.removeEventListener("selectstart", prevent);
    };
  }, [enabled]);
}
