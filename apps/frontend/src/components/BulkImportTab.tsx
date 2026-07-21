import { useState } from "react";
import { Copy, Check, Clipboard } from "lucide-react";

interface Props {
  onImport: (text: string) => Promise<number>;
  bulkText?: string;
}
//fix this
const SAMPLE_BULK_TEXT = `FORMAT:

1. Oddiy test (Single Choice)
# Savol matni
+ To'g'ri javob
- Noto'g'ri javob
- Noto'g'ri javob
- Noto'g'ri javob

2. Ko'p javobli test (Multiple Choice)
# Savol matni
+ To'g'ri javob
+ To'g'ri javob
- Noto'g'ri javob
- Noto'g'ri javob

3. Ochiq savol
# Savol matni

4. AI tekshiradigan ochiq savol
#~ Savol matni
+ To'g'ri javobning varianti
+ Yana bir variant
@ AI uchun qisqa baholash yo'riqnomasi (30 belgigacha)

5. True / False (javob To'g'ri)
#? Savol matni

6. True / False (javob Noto'g'ri)
#?f Savol matni

7. Tartiblash (Arrange)
# Savol matni
> 1-qadam
> 2-qadam
> 3-qadam
> 4-qadam

8. Reorder
#> Savol matni
> Birinchi
> Ikkinchi
> Uchinchi

9. Matching
#| Savol matni
| Chap :: O'ng
| HTML :: Web
| CSS :: Style
| JS :: Logic

10. Fill Blank
#= Savol matni
= To'g'ri javob

QOIDALAR

- Har bir savol bo'sh qator bilan ajratiladi.
- '+' faqat to'g'ri javob.
- '-' noto'g'ri javob.
- Single testda faqat 1 ta '+'.
- Multi testda 2 yoki undan ko'p '+'.
- Arrange va Reorder faqat '>' ishlatadi.
- Matching faqat '| chap :: o'ng'.
- FillBlank '= javob'.
- AI Open '#~' ishlatadi.
- Hech qanday markdown (\`\`\`) ishlatma.
- Faqat Bulk Import matnini qaytar.`;

export function BulkImportTab({ onImport, bulkText = "" }: Props) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copyBulk() {
    if (!bulkText) return;
    navigator.clipboard.writeText(bulkText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function insertSample() {
    setText(SAMPLE_BULK_TEXT);
    setPreview(null);
    setResult(null);
  }

  function handlePreview() {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const count = lines.filter((l) => l.startsWith("# ")).length;
    setPreview(`${count} ta savol import qilinadi.`);
    setResult(null);
  }

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const imported = await onImport(text);
      setResult(`ok:${imported} ta savol muvaffaqiyatli import qilindi.`);
      setText("");
      setPreview(null);
    } catch {
      setResult("err:Import amalga oshmadi. Formatni tekshiring.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-white/80 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Namuna pattern
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              # savol, + to'g'ri javob, - noto'g'ri javob, &gt; tartib, ~
              ortiqcha variant
            </p>
          </div>
          <button
            type="button"
            onClick={insertSample}
            className="flex shrink-0 items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors bg-white"
          >
            <Clipboard size={12} />
            Namunani qo'yish
          </button>
        </div>
        <pre className="max-h-44 overflow-auto rounded-lg bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-100 whitespace-pre-wrap">
          {SAMPLE_BULK_TEXT}
        </pre>
      </div>
      {bulkText && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copyBulk}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors bg-white"
          >
            {copied ? (
              <Check size={12} className="text-green-500" />
            ) : (
              <Copy size={12} />
            )}
            {copied ? "Nusxalandi" : "Savollarni nusxalash"}
          </button>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
          setResult(null);
        }}
        rows={10}
        placeholder="Savollarni shu yerga joylashtiring..."
        className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400 font-mono resize-y"
      />
      {preview && <p className="text-sm text-gray-600">{preview}</p>}
      {result && (
        <p
          className={`text-sm ${result.startsWith("ok:") ? "text-green-600" : "text-red-500"}`}
        >
          {result.startsWith("ok:") ? result.slice(3) : result.slice(4)}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!text.trim()}
          className="text-sm px-4 py-2rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          Ko'rish
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={!text.trim() || loading}
          className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-40"
        >
          {loading ? "Yuklanmoqda..." : "Import qilish"}
        </button>
      </div>
    </div>
  );
}
