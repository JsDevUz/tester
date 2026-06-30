import { useEffect, useState } from 'react';

interface OptionInput {
  text: string;
  isCorrect: boolean;
}

interface InitialValues {
  text: string;
  type: 'single' | 'multi' | 'open';
  options: OptionInput[];
}

interface Props {
  onSubmit: (data: { text: string; type: string; options: OptionInput[] }) => void;
  initial?: InitialValues;
  submitLabel?: string;
  onCancel?: () => void;
}

export function QuestionForm({ onSubmit, initial, submitLabel, onCancel }: Props) {
  const [text, setText] = useState(initial?.text ?? '');
  const [type, setType] = useState<'single' | 'multi' | 'open'>(initial?.type ?? 'single');
  const [opts, setOpts] = useState<OptionInput[]>(
    initial?.options.length
      ? initial.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
      : [{ text: '', isCorrect: false }, { text: '', isCorrect: false }]
  );

  useEffect(() => {
    if (!initial) return;
    setText(initial.text);
    setType(initial.type);
    setOpts(initial.options.length
      ? initial.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
      : [{ text: '', isCorrect: false }, { text: '', isCorrect: false }]
    );
  }, [initial]);

  function addOption() {
    setOpts([...opts, { text: '', isCorrect: false }]);
  }

  function removeOption(i: number) {
    setOpts(opts.filter((_, idx) => idx !== i));
  }

  function toggleCorrect(i: number) {
    if (type === 'single') {
      setOpts(opts.map((o, idx) => ({ ...o, isCorrect: idx === i })));
    } else {
      setOpts(opts.map((o, idx) => idx === i ? { ...o, isCorrect: !o.isCorrect } : o));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const validOpts = opts.filter((o) => o.text.trim());
    onSubmit({ text: text.trim(), type, options: validOpts });
    setText('');
    setType('single');
    setOpts([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="Savol matni..." required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
      <div className="flex gap-2">
        {(['single', 'multi', 'open'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${type === t ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
            {t === 'single' ? 'Yagona tanlov' : t === 'multi' ? 'Ko\'p tanlov' : 'Ochiq javob'}
          </button>
        ))}
      </div>
      {type !== 'open' && (
        <div className="flex flex-col gap-2">
          {opts.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={type === 'single' ? 'radio' : 'checkbox'}
                checked={opt.isCorrect} onChange={() => toggleCorrect(i)}
                name="correct" className="w-4 h-4 accent-indigo-500" />
              <input value={opt.text} onChange={(e) => setOpts(opts.map((o, idx) => idx === i ? { ...o, text: e.target.value } : o))}
                placeholder={`Variant ${i + 1}`}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              <button type="button" onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={addOption} className="text-xs text-indigo-500 hover:text-indigo-700 self-start">+ Variant qo'shish</button>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700">
            Bekor qilish
          </button>
        )}
        <button type="submit" className="text-sm bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600">
          {submitLabel ?? 'Savol qo\'shish'}
        </button>
      </div>
    </form>
  );
}
