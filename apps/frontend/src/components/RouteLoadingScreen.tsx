import { LoaderCircle } from 'lucide-react';

export function RouteLoadingScreen() {
  return (
    <div className="route-loading-screen flex min-h-[100dvh] items-center justify-center px-6">
      <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
        <LoaderCircle className="route-loading-spinner h-7 w-7 animate-spin" aria-hidden="true" />
        <p className="route-loading-label text-sm font-medium">Yuklanmoqda...</p>
      </div>
    </div>
  );
}
