import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Languages } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";
import {
  apiFetchWordDecks,
  apiCreateWordDeck,
  type WordDeck,
} from "../api/word-decks";

export function MyDictionariesPage() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<WordDeck[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setDecks(await apiFetchWordDecks());
    } catch {
      toast.error("Lug'atlarni yuklab bo'lmadi");
      setDecks([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await apiCreateWordDeck(newName.trim());
      setNewName("");
      setDecks((prev) => [created, ...(prev ?? [])]);
      toast.success("Lug'at yaratildi");
    } catch {
      toast.error("Lug'at yaratib bo'lmadi");
    } finally {
      setCreating(false);
    }
  }

  return (
    <StudentShell>
      <div className="w-full px-4 py-5 lg:px-6 lg:py-6 text-[var(--text-primary)]">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate("/jamm")}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl px-3 py-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} /> Orqaga
          </button>
          <h1 className="mb-1 text-2xl font-extrabold text-[var(--text-primary)]">Mening lug'atlarim</h1>
          <p className="text-xs font-semibold text-[var(--text-muted)]">So'z-tarjima lug'atlaringizni tuzing va ulashing</p>
        </div>

        <StudentActiveBanners className="mb-5" />

        <div className="mb-6 flex gap-2.5 max-w-lg">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) void handleCreate();
            }}
            placeholder="Yangi lug'at nomi"
            className="flex-1 rounded-2xl bg-black/5 dark:bg-black/25 border border-black/10 dark:border-white/10 px-4 py-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          <button
            type="button"
            disabled={!newName.trim() || creating}
            onClick={() => void handleCreate()}
            className="flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-md cursor-pointer shrink-0"
          >
            <Plus size={16} /> Yaratish
          </button>
        </div>

        {!decks ? (
          <div className="glass-card rounded-3xl border border-black/5 dark:border-white/10 py-16 text-center text-sm font-bold text-[var(--text-muted)]">
            Yuklanmoqda...
          </div>
        ) : decks.length === 0 ? (
          <div className="glass-card rounded-3xl border border-black/5 dark:border-white/10 py-16 text-center text-sm font-bold text-[var(--text-muted)]">
            Hali lug'at yo'q. Yangisini yarating!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {decks.map((deck) => (
              <div
                key={deck.id}
                onClick={() => navigate(`/my-dictionaries/${deck.id}`)}
                className="glass-card group relative flex cursor-pointer items-center gap-3.5 rounded-2xl border border-black/5 dark:border-white/10 p-4 transition-all hover:scale-[1.01] hover:shadow-md"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                  <Languages size={20} />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{deck.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
