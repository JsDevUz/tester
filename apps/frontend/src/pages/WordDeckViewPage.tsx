import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Link2, Play, Trash2, Upload, X } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import {
  apiListDeckWords,
  apiAddDeckWord,
  apiBulkImportDeckWords,
  apiDeleteDeckWord,
  apiFetchWordDecks,
  type DeckWord,
  type WordDeck,
} from "../api/word-decks";

export function WordDeckViewPage() {
  const { id: deckId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<WordDeck | null>(null);
  const [words, setWords] = useState<DeckWord[] | null>(null);
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!deckId) return;
    try {
      const [wordList, decks] = await Promise.all([apiListDeckWords(deckId), apiFetchWordDecks()]);
      setWords(wordList);
      setDeck(decks.find((d) => d.id === deckId) ?? null);
    } catch {
      toast.error("So'zlarni yuklab bo'lmadi");
      setWords([]);
    }
  }, [deckId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!deckId || !newWord.trim() || !newTranslation.trim() || saving) return;
    setSaving(true);
    try {
      const added = await apiAddDeckWord(deckId, { word: newWord.trim(), translation: newTranslation.trim() });
      setWords((current) => [...(current ?? []), added]);
      setNewWord("");
      setNewTranslation("");
    } catch {
      toast.error("So'z qo'shib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(wordId: string) {
    if (!deckId) return;
    try {
      await apiDeleteDeckWord(deckId, wordId);
      setWords((current) => current?.filter((w) => w.id !== wordId) ?? []);
      toast.success("So'z o'chirildi");
    } catch {
      toast.error("So'zni o'chirib bo'lmadi");
    }
  }

  function copyLink() {
    if (!deck) return;
    const url = `${window.location.origin}/d/${deck.slug}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 1500);
  }

  if (!deckId) return null;

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/my-dictionaries")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={16} /> Lug'atlar
        </button>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100">{deck?.name ?? "Lug'at"}</h1>
          {deck && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/d/${deck.slug}`)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                <Play size={13} fill="currentColor" />
                Mashq qilish
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                {copied ? <Check size={14} /> : <Link2 size={14} />}
                {copied ? "Nusxalandi!" : "Havola nusxalash"}
              </button>
            </div>
          )}
        </div>

        {!words ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : (
          <div className="rounded-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-gray-800">So'zlar</h3>
              <button type="button" onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200">
                <Upload size={14} /> Ommaviy import
              </button>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="So'z" className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
              <input value={newTranslation} onChange={(e) => setNewTranslation(e.target.value)} placeholder="Tarjima" className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
              <button type="button" disabled={!newWord.trim() || !newTranslation.trim() || saving} onClick={() => void handleAdd()} className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200">
                Qo'shish
              </button>
            </div>
            {words.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-300">Hali so'z yo'q</p>
            ) : (
              <div className="flex flex-col gap-2">
                {words.map((word) => (
                  <div key={word.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-100 dark:border-zinc-700/60 px-4 py-3">
                    <span className="truncate text-sm font-bold text-gray-900 dark:text-zinc-100">{word.word}</span>
                    <span className="truncate text-sm text-gray-500 dark:text-zinc-400">{word.translation}</span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(word.id)}
                      aria-label="So'zni o'chirish"
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {importOpen && deckId && (
        <BulkImportModal deckId={deckId} onClose={() => setImportOpen(false)} onImported={() => void load()} />
      )}
    </StudentShell>
  );
}

function BulkImportModal({ deckId, onClose, onImported }: { deckId: string; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  async function submit() {
    if (!text.trim() || importing) return;
    setImporting(true);
    try {
      const result = await apiBulkImportDeckWords(deckId, text);
      toast.success(`${result.added} ta qo'shildi, ${result.skipped} ta o'tkazib yuborildi`);
      onImported();
      onClose();
    } catch {
      toast.error("Import qilib bo'lmadi");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-card w-full max-w-lg rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Ommaviy import</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"><X size={16} /></button>
        </div>
        <p className="mb-4 text-xs text-[var(--text-muted)] leading-relaxed">Har qatorda: <code>so'z - tarjima</code></p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={"apple - olma\nbook - kitob"} className="mb-4 w-full rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-3 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all placeholder:text-[var(--text-muted)]" />
        <button type="button" disabled={!text.trim() || importing} onClick={() => void submit()} className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-40 transition-colors cursor-pointer">
          {importing ? "Import qilinmoqda..." : "Import qilish"}
        </button>
      </div>
    </div>
  );
}
