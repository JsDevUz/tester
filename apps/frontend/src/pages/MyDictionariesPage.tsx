import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Languages } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
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

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await apiCreateWordDeck(newName.trim());
      setNewName("");
      void load();
    } catch {
      toast.error("Lug'at yaratib bo'lmadi");
    } finally {
      setCreating(false);
    }
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/jamm")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Orqaga
        </button>
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Mening lug'atlarim</h1>
        <p className="mb-6 text-sm text-gray-400">So'z-tarjima lug'atlaringizni tuzing va ulashing</p>

        <div className="mb-6 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Yangi lug'at nomi"
            className="flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
          />
          <button
            type="button"
            disabled={!newName.trim() || creating}
            onClick={() => void handleCreate()}
            className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200"
          >
            <Plus size={16} /> Yaratish
          </button>
        </div>

        {!decks ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : decks.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali lug'at yo'q. Yangisini yarating!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {decks.map((deck) => (
              <div
                key={deck.id}
                onClick={() => navigate(`/d/${deck.slug}`)}
                className="group relative flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500">
                  <Languages size={18} />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{deck.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
