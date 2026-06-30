import { useState } from 'react';

interface Props {
  onImport: (text: string) => Promise<number>;
}

const HINT = `# Question text
+ Correct answer
- Wrong answer 1
- Wrong answer 2

# Multi-correct question
+ First correct
+ Second correct
- Wrong one

# Open question (no options needed)`;

export function BulkImportTab({ onImport }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function handlePreview() {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const count = lines.filter((l) => l.startsWith('# ')).length;
    setPreview(`Found ${count} question(s) to import.`);
    setResult(null);
  }

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const imported = await onImport(text);
      setResult(`✓ ${imported} questions imported successfully.`);
      setText('');
      setPreview(null);
    } catch {
      setResult('✗ Import failed. Check format and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 font-mono whitespace-pre">{HINT}</div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setResult(null); }}
        rows={10} placeholder="Paste your questions here..."
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 font-mono resize-y" />
      {preview && <p className="text-sm text-gray-600">{preview}</p>}
      {result && <p className={`text-sm ${result.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{result}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={handlePreview} disabled={!text.trim()}
          className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          Preview
        </button>
        <button type="button" onClick={handleImport} disabled={!text.trim() || loading}
          className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-40">
          {loading ? 'Importing...' : 'Import'}
        </button>
      </div>
    </div>
  );
}
