import { useState } from 'react';

interface Props {
  onImport: (text: string) => Promise<number>;
  defaultValue?: string;
}

const HINT = `# Yagona/ko'p tanlov savoli
+ To'g'ri javob
- Noto'g'ri javob 1
- Noto'g'ri javob 2

# Ko'p to'g'ri javob
+ Birinchi to'g'ri
+ Ikkinchi to'g'ri
- Noto'g'ri

# Ochiq savol (variantsiz)

# Gap tuzish savoli
> Birinchi bo'lak
> Ikkinchi bo'lak
> Uchinchi bo'lak
~ Chalg'ituvchi bo'lak`;

export function BulkImportTab({ onImport, defaultValue = '' }: Props) {
  const [text, setText] = useState(defaultValue);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function handlePreview() {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const count = lines.filter((l) => l.startsWith('# ')).length;
    setPreview(`${count} ta savol import qilinadi.`);
    setResult(null);
  }

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const imported = await onImport(text);
      setResult(`ok:${imported} ta savol muvaffaqiyatli import qilindi.`);
      setText('');
      setPreview(null);
    } catch {
      setResult('err:Import amalga oshmadi. Formatni tekshiring.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 font-mono whitespace-pre">{HINT}</div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setResult(null); }}
        rows={10} placeholder="Savollarni shu yerga joylashtiring..."
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 font-mono resize-y" />
      {preview && <p className="text-sm text-gray-600">{preview}</p>}
      {result && (
        <p className={`text-sm ${result.startsWith('ok:') ? 'text-green-600' : 'text-red-500'}`}>
          {result.startsWith('ok:') ? result.slice(3) : result.slice(4)}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={handlePreview} disabled={!text.trim()}
          className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          Ko'rish
        </button>
        <button type="button" onClick={handleImport} disabled={!text.trim() || loading}
          className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-40">
          {loading ? 'Yuklanmoqda...' : 'Import qilish'}
        </button>
      </div>
    </div>
  );
}
