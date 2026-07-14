import { Sparkles } from 'lucide-react';
import { AppShell } from '../components/AppShell';

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
          <Sparkles size={28} className="text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-400">Tez orada ishga tushadi.</p>
      </div>
    </AppShell>
  );
}
