import { lazy, type ComponentType } from "react";

const RELOAD_MARKER = "chunk-reload-at";

/**
 * `lazy()` that survives a deploy.
 *
 * Each page is its own chunk, named with a content hash. Deploying replaces those files, so a
 * tab opened before the deploy asks for a filename that no longer exists the moment the user
 * navigates -- the dynamic import rejects and, with no error boundary above it, takes the
 * whole app down. That is the full-page error people hit during a release.
 *
 * A failed import is retried once, and if it fails again the page is reloaded to pick up the
 * new build. The reload is stamped in sessionStorage so a genuinely broken chunk cannot put
 * the tab in a reload loop -- after one attempt the error is allowed through to the router's
 * errorElement.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      // A transient network blip is worth one immediate retry before reloading.
      try {
        return await factory();
      } catch {
        const lastReload = Number(sessionStorage.getItem(RELOAD_MARKER) ?? 0);
        const reloadedRecently = Date.now() - lastReload < 10_000;

        if (!reloadedRecently) {
          sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
          window.location.reload();
          // Never resolves; the reload replaces this document.
          return new Promise<{ default: T }>(() => {});
        }

        throw error;
      }
    }
  });
}
