import { useRef, useState } from 'react';
import { Image, Music, X, Upload, GripHorizontal, Plus, Trash2 } from 'lucide-react';
import { apiUploadMedia } from '../api/questions';

interface OptionInput {
  text: string;
  isCorrect: boolean;
  orderIndex?: number;
}

interface InitialValues {
  text: string;
  type: 'single' | 'multi' | 'open' | 'arrange';
  options: OptionInput[];
  imageUrl?: string | null;
  audioUrl?: string | null;
}

interface Props {
  onSubmit: (data: {
    text: string;
    type: string;
    options: OptionInput[];
    imageUrl?: string | null;
    audioUrl?: string | null;
  }) => void;
  initial?: InitialValues;
  submitLabel?: string;
  onCancel?: () => void;
}

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
function mediaUrl(url: string) { return url.startsWith('http') ? url : `${BACKEND}${url}`; }

const TYPE_LABELS: Record<string, string> = {
  single: 'Yagona tanlov',
  multi: "Ko'p tanlov",
  open: 'Ochiq javob',
  arrange: 'Gap tuzish',
};

export function QuestionForm({ onSubmit, initial, submitLabel, onCancel }: Props) {
  const [text, setText] = useState(initial?.text ?? '');
  const [type, setType] = useState<'single' | 'multi' | 'open' | 'arrange'>(initial?.type ?? 'single');
  const [opts, setOpts] = useState<OptionInput[]>(() => {
    if (initial?.options.length) {
      return initial.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: o.orderIndex }));
    }
    return [{ text: '', isCorrect: false }, { text: '', isCorrect: false }];
  });
  // arrange: correct tokens in order + distractors
  const [correctTokens, setCorrectTokens] = useState<string[]>(() => {
    if (initial?.type === 'arrange') {
      return initial.options
        .filter((o) => o.isCorrect)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        .map((o) => o.text);
    }
    return ['', ''];
  });
  const [distractors, setDistractors] = useState<string[]>(() => {
    if (initial?.type === 'arrange') {
      return initial.options.filter((o) => !o.isCorrect).map((o) => o.text);
    }
    return [];
  });

  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [audioUrl, setAudioUrl] = useState<string | null>(initial?.audioUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('Fayl hajmi 10 MB dan oshmasligi kerak'); return; }
    setUploadError(null);
    setUploading(true);
    try {
      const res = await apiUploadMedia(file);
      if (res.type === 'image') setImageUrl(res.url);
      else setAudioUrl(res.url);
    } catch {
      setUploadError('Yuklashda xato yuz berdi');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function addOption() { setOpts([...opts, { text: '', isCorrect: false }]); }
  function removeOption(i: number) { setOpts(opts.filter((_, idx) => idx !== i)); }
  function toggleCorrect(i: number) {
    if (type === 'single') setOpts(opts.map((o, idx) => ({ ...o, isCorrect: idx === i })));
    else setOpts(opts.map((o, idx) => idx === i ? { ...o, isCorrect: !o.isCorrect } : o));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    let options: OptionInput[];
    if (type === 'arrange') {
      const validTokens = correctTokens.filter((t) => t.trim());
      const validDistractors = distractors.filter((d) => d.trim());
      if (validTokens.length < 2) return;
      options = [
        ...validTokens.map((t, i) => ({ text: t.trim(), isCorrect: true, orderIndex: i })),
        ...validDistractors.map((d) => ({ text: d.trim(), isCorrect: false, orderIndex: 0 })),
      ];
    } else {
      options = opts.filter((o) => o.text.trim());
    }

    onSubmit({ text: text.trim(), type, options, imageUrl, audioUrl });

    // reset
    setText('');
    setType('single');
    setOpts([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    setCorrectTokens(['', '']);
    setDistractors([]);
    setImageUrl(null);
    setAudioUrl(null);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="Savol matni..." required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />

      {/* Media */}
      <div className="flex items-center gap-2 flex-wrap">
        {imageUrl ? (
          <div className="relative group inline-block">
            <img src={mediaUrl(imageUrl)} alt="" className="h-20 w-auto rounded-lg object-cover border border-gray-200" />
            <button type="button" onClick={() => setImageUrl(null)}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={10} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => imageRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-40">
            <Image size={13} /> Rasm
          </button>
        )}
        {audioUrl ? (
          <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-3 py-1.5 border border-indigo-100">
            <Music size={13} className="text-indigo-500 shrink-0" />
            <audio src={mediaUrl(audioUrl)} controls className="h-7" />
            <button type="button" onClick={() => setAudioUrl(null)} className="text-gray-400 hover:text-red-400"><X size={12} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => audioRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-40">
            <Music size={13} /> Audio
          </button>
        )}
        {uploading && <span className="flex items-center gap-1 text-xs text-indigo-500"><Upload size={12} className="animate-bounce" /> Yuklanmoqda...</span>}
        {uploadError && <span className="text-xs text-red-500">{uploadError}</span>}
      </div>
      <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileChange} />
      <input ref={audioRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4" className="hidden" onChange={handleFileChange} />

      {/* Type selector */}
      <div className="flex gap-2 flex-wrap">
        {(['single', 'multi', 'open', 'arrange'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${type === t ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Options by type */}
      {type === 'arrange' && (
        <div className="flex flex-col gap-3">
          {/* Correct tokens in order */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
              <GripHorizontal size={12} /> To'g'ri tartib (ketma-ketlikda kiriting)
            </p>
            <div className="flex flex-col gap-1.5">
              {correctTokens.map((tok, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-indigo-400 font-mono w-5 text-right shrink-0">{i + 1}.</span>
                  <input
                    value={tok}
                    onChange={(e) => setCorrectTokens(correctTokens.map((t, idx) => idx === i ? e.target.value : t))}
                    placeholder={`Bo'lak ${i + 1}`}
                    className="flex-1 border border-indigo-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-indigo-50/40"
                  />
                  {correctTokens.length > 2 && (
                    <button type="button" onClick={() => setCorrectTokens(correctTokens.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-400"><Trash2 size={13} /></button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setCorrectTokens([...correctTokens, ''])}
                className="text-xs text-indigo-500 hover:text-indigo-700 self-start flex items-center gap-1 mt-0.5">
                <Plus size={12} /> Bo'lak qo'shish
              </button>
            </div>
          </div>

          {/* Distractors */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Chalg'ituvchi bo'laklar (ixtiyoriy)</p>
            <div className="flex flex-col gap-1.5">
              {distractors.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={d}
                    onChange={(e) => setDistractors(distractors.map((t, idx) => idx === i ? e.target.value : t))}
                    placeholder={`Chalg'ituvchi ${i + 1}`}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  <button type="button" onClick={() => setDistractors(distractors.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setDistractors([...distractors, ''])}
                className="text-xs text-gray-400 hover:text-gray-600 self-start flex items-center gap-1 mt-0.5">
                <Plus size={12} /> Chalg'ituvchi qo'shish
              </button>
            </div>
          </div>

          {/* Preview */}
          {correctTokens.filter(t => t.trim()).length >= 2 && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-2">Ko'rinishi:</p>
              <div className="flex flex-wrap gap-1.5">
                {[...correctTokens.filter(t => t.trim()), ...distractors.filter(d => d.trim())]
                  .sort(() => Math.random() - 0.5)
                  .map((tok, i) => (
                    <span key={i} className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm">{tok}</span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(type === 'single' || type === 'multi') && (
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
          <button type="button" onClick={onCancel} className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700">Bekor qilish</button>
        )}
        <button type="submit" disabled={uploading}
          className="text-sm bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-40">
          {submitLabel ?? "Savol qo'shish"}
        </button>
      </div>
    </form>
  );
}
