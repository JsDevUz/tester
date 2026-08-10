import { useCallback, useEffect, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiAddChallengeWord, apiBulkImportChallengeWords, apiDeleteChallengeWord,
  apiListChallengeWords, type ApiChallengeWord,
} from '../../api/challenge-words';

export function CourseChallengeWordsPanel({ challengeId }: { challengeId: string }) {
  const [words, setWords] = useState<ApiChallengeWord[] | null>(null);
  const [newWord, setNewWord] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setWords(await apiListChallengeWords(challengeId));
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "So'zlarni yuklab bo'lmadi");
      setWords([]);
    }
  }, [challengeId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!newWord.trim() || !newTranslation.trim() || saving) return;
    setSaving(true);
    try {
      const added = await apiAddChallengeWord(challengeId, { word: newWord.trim(), translation: newTranslation.trim() });
      setWords((current) => [...(current ?? []), added]);
      setNewWord('');
      setNewTranslation('');
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "So'z qo'shib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(wordId: string) {
    try {
      await apiDeleteChallengeWord(challengeId, wordId);
      setWords((current) => current?.filter((word) => word.id !== wordId) ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "So'zni o'chirib bo'lmadi");
    }
  }

  if (!words) return <div className="rounded-2xl bg-white p-5 text-sm text-gray-400">Yuklanmoqda...</div>;

  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-gray-800">So'zlar</h3>
        <button type="button" onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200">
          <Upload size={14} /> Ommaviy import
        </button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={newWord} onChange={(event) => setNewWord(event.target.value)} placeholder="So'z" className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <input value={newTranslation} onChange={(event) => setNewTranslation(event.target.value)} placeholder="Tarjima" className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <button type="button" disabled={!newWord.trim() || !newTranslation.trim() || saving} onClick={() => void handleAdd()} className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200">
          Qo'shish
        </button>
      </div>
      {words.length === 0 ? <p className="py-8 text-center text-sm text-gray-300">Hali so'z yo'q</p> : (
        <div className="flex flex-col gap-2">
          {words.map((word) => (
            <div key={word.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5">
              <span className="truncate text-sm font-semibold text-gray-800">{word.word}</span>
              <span className="truncate text-sm text-gray-500">{word.translation}</span>
              <button type="button" onClick={() => void handleDelete(word.id)} aria-label="So'zni o'chirish" className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {importOpen && <BulkImportModal challengeId={challengeId} onClose={() => setImportOpen(false)} onImported={() => void load()} />}
    </div>
  );
}

function BulkImportModal({ challengeId, onClose, onImported }: { challengeId: string; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  async function submit() {
    if (!text.trim() || importing) return;
    setImporting(true);
    try {
      const result = await apiBulkImportChallengeWords(challengeId, text);
      toast.success(`${result.added} ta qo'shildi, ${result.skipped} ta o'tkazib yuborildi`);
      onImported();
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Import qilib bo'lmadi");
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6">
        <div className="mb-1 flex items-center justify-between"><h3 className="font-bold text-gray-800">Ommaviy import</h3><button type="button" onClick={onClose}><X size={18} /></button></div>
        <p className="mb-4 text-xs text-gray-400">Har qatorda: <code>so'z - tarjima</code></p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={'apple - olma\nbook - kitob'} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none" />
        <button type="button" disabled={!text.trim() || importing} onClick={() => void submit()} className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:bg-gray-200">Import qilish</button>
      </div>
    </div>
  );
}
