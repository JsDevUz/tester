import { useRouteError } from "react-router-dom";

/**
 * Shown instead of React Router's built-in "Unexpected Application Error" screen, which
 * exposes a stack trace and a note addressed to developers.
 *
 * The common cause in production is a deploy: page chunks are hashed, so a tab opened before
 * a release asks for a filename that no longer exists. `lazyWithRetry` reloads the page for
 * that case, and this boundary catches whatever still gets through.
 */
export function RouteErrorBoundary() {
  const error = useRouteError() as any;
  const message = String(error?.message ?? "");
  const isStaleChunk =
    message.includes("dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("Failed to fetch");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
        {isStaleChunk ? "Ilova yangilandi" : "Nimadir xato ketdi"}
      </h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {isStaleChunk
          ? "Sahifani yangilang — eng so'nggi versiya yuklanadi."
          : "Sahifani yangilab ko'ring. Muammo takrorlansa, birozdan so'ng qayta urinib ko'ring."}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Yangilash
      </button>
    </div>
  );
}
