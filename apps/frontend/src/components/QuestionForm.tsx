import { useRef, useState, useCallback } from 'react';

function DropPinEditor({ imageUrl, correctAnswer, radiusPct, onChange }: {
  imageUrl: string; correctAnswer: string; radiusPct: number; onChange: (v: string) => void;
}) {
  const [containerW, setContainerW] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setContainerW(rect.width);
    const x = ((e.clientX - rect.left) / rect.width).toFixed(4);
    const y = ((e.clientY - rect.top) / rect.height).toFixed(4);
    onChange(`${x},${y}`);
  }, [onChange]);

  const pin = correctAnswer ? correctAnswer.split(',').map(Number) : null;
  const radiusPx = (radiusPct / 100) * (containerW || containerRef.current?.getBoundingClientRect().width || 300);

  return (
    <div ref={containerRef} className="relative w-full cursor-crosshair" onClick={handleClick}>
      <img src={imageUrl} alt="" className="w-full rounded-xl object-contain border border-gray-200 select-none pointer-events-none" draggable={false} />
      {pin && (
        <>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full border-2 border-red-400/50 bg-red-100/30"
            style={{ left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%`, width: radiusPx * 2, height: radiusPx * 2 }} />
          <div className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%` }}>
            <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow-lg" />
          </div>
        </>
      )}
    </div>
  );
}
import { Image, Music, X, Upload, GripHorizontal, Plus, Trash2 } from 'lucide-react';
import { apiUploadMedia } from '../api/questions';

interface OptionInput {
  text: string;
  isCorrect: boolean;
  orderIndex?: number;
}

interface InitialValues {
  text: string;
  type: 'single' | 'multi' | 'open' | 'arrange' | 'truefalse' | 'reorder' | 'matching' | 'fillblank' | 'slider' | 'droppin';
  options: OptionInput[];
  imageUrl?: string | null;
  audioUrl?: string | null;
  correctAnswer?: string | null;
}

interface Props {
  onSubmit: (data: {
    text: string;
    type: string;
    options: OptionInput[];
    imageUrl?: string | null;
    audioUrl?: string | null;
    correctAnswer?: string | null;
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
  truefalse: "To'g'ri/Noto'g'ri",
  reorder: 'Tartibga solish',
  matching: 'Moslashtirish',
  fillblank: "Bo'sh joy",
  slider: 'Slider',
  droppin: 'Drop Pin',
};

export function QuestionForm({ onSubmit, initial, submitLabel, onCancel }: Props) {
  const [text, setText] = useState(initial?.text ?? '');
  const [type, setType] = useState<'single' | 'multi' | 'open' | 'arrange' | 'truefalse' | 'reorder' | 'matching' | 'fillblank' | 'slider' | 'droppin'>(initial?.type ?? 'single');
  const [opts, setOpts] = useState<OptionInput[]>(() => {
    if (initial?.options.length) {
      return initial.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: o.orderIndex }));
    }
    return [{ text: '', isCorrect: false }, { text: '', isCorrect: false }];
  });
  // arrange/reorder: correct tokens in order + distractors (arrange only)
  const [correctTokens, setCorrectTokens] = useState<string[]>(() => {
    if (initial?.type === 'arrange' || initial?.type === 'reorder') {
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

  const [correctAnswer, setCorrectAnswer] = useState<string>(initial?.correctAnswer ?? '');
  // matching: array of { left, right } pairs
  const [matchPairs, setMatchPairs] = useState<{ left: string; right: string }[]>(() => {
    if (initial?.type === 'matching' && initial.options.length) {
      const lefts = initial.options.filter((o) => o.isCorrect).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      const rights = initial.options.filter((o) => !o.isCorrect).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      return lefts.map((l, i) => ({ left: l.text, right: rights[i]?.text ?? '' }));
    }
    return [{ left: '', right: '' }, { left: '', right: '' }];
  });
  // truefalse: which option is correct — 'true' | 'false' | null (not selected)
  const [tfCorrect, setTfCorrect] = useState<'true' | 'false' | null>(() => {
    if (initial?.type === 'truefalse' && initial.options.length) {
      const correct = initial.options.find((o) => o.isCorrect);
      if (correct?.text === "To'g'ri") return 'true';
      if (correct?.text === "Noto'g'ri") return 'false';
    }
    return null;
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
    } else if (type === 'reorder') {
      const validTokens = correctTokens.filter((t) => t.trim());
      if (validTokens.length < 2) return;
      options = validTokens.map((t, i) => ({ text: t.trim(), isCorrect: true, orderIndex: i }));
    } else if (type === 'truefalse') {
      if (!tfCorrect) { setUploadError("To'g'ri yoki Noto'g'rini tanlang"); return; }
      options = [
        { text: "To'g'ri", isCorrect: tfCorrect === 'true', orderIndex: 0 },
        { text: "Noto'g'ri", isCorrect: tfCorrect === 'false', orderIndex: 1 },
      ];
    } else if (type === 'matching') {
      const valid = matchPairs.filter((p) => p.left.trim() && p.right.trim());
      if (valid.length < 2) { setUploadError('Kamida 2 ta juft kiriting'); return; }
      options = valid.flatMap((p, i) => [
        { text: p.left.trim(), isCorrect: true, orderIndex: i },
        { text: p.right.trim(), isCorrect: false, orderIndex: i },
      ]);
    } else if (type === 'fillblank') {
      options = [];
    } else if (type === 'slider') {
      // options[0]=min, options[1]=max, options[2]=step
      options = [
        { text: opts[0]?.text || '0', isCorrect: false, orderIndex: 0 },
        { text: opts[1]?.text || '100', isCorrect: false, orderIndex: 1 },
        { text: opts[2]?.text || '1', isCorrect: false, orderIndex: 2 },
      ];
    } else if (type === 'droppin') {
      options = [{ text: opts[0]?.text || '8', isCorrect: false, orderIndex: 0 }];
    } else {
      options = opts.filter((o) => o.text.trim());
      if ((type === 'single' || type === 'multi') && options.length > 0) {
        const hasCorrect = options.some((o) => o.isCorrect);
        if (!hasCorrect) { setUploadError("Kamida bitta to'g'ri javob belgilanishi shart"); return; }
      }
    }
    setUploadError(null);

    onSubmit({ text: text.trim(), type, options, imageUrl, audioUrl, correctAnswer: correctAnswer.trim() || null });

    // reset
    setText('');
    setType(initial ? type : 'single');
    setOpts([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    setCorrectTokens(['', '']);
    setDistractors([]);
    setCorrectAnswer('');
    setTfCorrect(null);
    setMatchPairs([{ left: '', right: '' }, { left: '', right: '' }]);
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
        {(['single', 'multi', 'open', 'arrange', 'truefalse', 'reorder', 'matching', 'fillblank', 'slider', 'droppin'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${type === t ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Options by type */}
      {type === 'truefalse' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">To'g'ri javobni tanlang:</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setTfCorrect('true')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                tfCorrect === 'true'
                  ? 'bg-green-500 text-white border-green-500'
                  : 'border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600'
              }`}>
              ✓ To'g'ri
            </button>
            <button type="button" onClick={() => setTfCorrect('false')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                tfCorrect === 'false'
                  ? 'bg-red-400 text-white border-red-400'
                  : 'border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500'
              }`}>
              ✗ Noto'g'ri
            </button>
          </div>
        </div>
      )}

      {type === 'fillblank' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">Savol matnida <code className="bg-gray-100 px-1 rounded">___</code> yozing, to'g'ri javobni kiriting:</p>
          <input
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
            placeholder="To'g'ri javob..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      )}

      {type === 'slider' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">Slider sozlamalari:</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-400">Min</label>
              <input type="number" placeholder="0"
                value={opts[0]?.text ?? ''}
                onChange={(e) => setOpts([{ text: e.target.value, isCorrect: false }, opts[1] ?? { text: '', isCorrect: false }, opts[2] ?? { text: '', isCorrect: false }])}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Max</label>
              <input type="number" placeholder="100"
                value={opts[1]?.text ?? ''}
                onChange={(e) => setOpts([opts[0] ?? { text: '', isCorrect: false }, { text: e.target.value, isCorrect: false }, opts[2] ?? { text: '', isCorrect: false }])}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Qadam</label>
              <input type="number" placeholder="1"
                value={opts[2]?.text ?? ''}
                onChange={(e) => setOpts([opts[0] ?? { text: '', isCorrect: false }, opts[1] ?? { text: '', isCorrect: false }, { text: e.target.value, isCorrect: false }])}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400">To'g'ri qiymat</label>
            <input type="number"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="Masalan: 42"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
        </div>
      )}

      {type === 'droppin' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">Rasm yuklang va to'g'ri joyni bosing:</p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-400 shrink-0">Radius (1–30%):</label>
            <input type="number" min={1} max={30}
              value={opts[0]?.text ?? '8'}
              onChange={(e) => setOpts([{ text: e.target.value, isCorrect: false }])}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-lime-400" />
            <span className="text-[10px] text-gray-400">% (katta = keng, kichik = aniq)</span>
          </div>
          {imageUrl ? (
            <DropPinEditor
              imageUrl={mediaUrl(imageUrl)}
              correctAnswer={correctAnswer}
              radiusPct={parseFloat(opts[0]?.text ?? '8')}
              onChange={setCorrectAnswer}
            />
          ) : (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-4 text-center border border-dashed border-gray-200">
              Yuqoridan rasm yuklang, keyin to'g'ri joyni bosing
            </div>
          )}
          {correctAnswer && <p className="text-[10px] text-gray-400">Pin: {correctAnswer} | Radius: {opts[0]?.text ?? '8'}%</p>}
        </div>
      )}

      {type === 'matching' && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1 mb-1">
            <p className="text-xs text-gray-500 font-medium px-1">Chap (savol)</p>
            <p className="text-xs text-gray-500 font-medium px-1">O'ng (javob)</p>
          </div>
          {matchPairs.map((pair, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-center">
              <input value={pair.left}
                onChange={(e) => setMatchPairs(matchPairs.map((p, idx) => idx === i ? { ...p, left: e.target.value } : p))}
                placeholder={`Savol ${i + 1}`}
                className="border border-indigo-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-indigo-50/30"
              />
              <div className="flex gap-1 items-center">
                <input value={pair.right}
                  onChange={(e) => setMatchPairs(matchPairs.map((p, idx) => idx === i ? { ...p, right: e.target.value } : p))}
                  placeholder={`Javob ${i + 1}`}
                  className="flex-1 border border-green-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-400 bg-green-50/30"
                />
                {matchPairs.length > 2 && (
                  <button type="button" onClick={() => setMatchPairs(matchPairs.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setMatchPairs([...matchPairs, { left: '', right: '' }])}
            className="text-xs text-indigo-500 hover:text-indigo-700 self-start flex items-center gap-1">
            <Plus size={12} /> Juft qo'shish
          </button>
        </div>
      )}

      {type === 'reorder' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <GripHorizontal size={12} /> To'g'ri tartibni kiriting (o'quvchi aralashtirilib beriladi)
          </p>
          <div className="flex flex-col gap-1.5">
            {correctTokens.map((tok, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-indigo-400 font-mono w-5 text-right shrink-0">{i + 1}.</span>
                <input
                  value={tok}
                  onChange={(e) => setCorrectTokens(correctTokens.map((t, idx) => idx === i ? e.target.value : t))}
                  placeholder={`Element ${i + 1}`}
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
              <Plus size={12} /> Element qo'shish
            </button>
          </div>
          {correctTokens.filter(t => t.trim()).length >= 2 && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-2">O'quvchiga ko'rinishi (aralashtirilgan):</p>
              <div className="flex flex-wrap gap-1.5">
                {[...correctTokens.filter(t => t.trim())].sort(() => Math.random() - 0.5).map((tok, i) => (
                  <span key={i} className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm">{tok}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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

      {type === 'open' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">To'g'ri javoblar (agar o'quvchi yozsa — to'g'ri hisoblanadi):</p>
          {opts.filter((o) => o.isCorrect).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-green-400 shrink-0" />
              <input
                value={opt.text}
                onChange={(e) => setOpts(opts.map((o, idx) => idx === opts.indexOf(opt) ? { ...o, text: e.target.value } : o))}
                placeholder={`To'g'ri variant ${i + 1}`}
                className="flex-1 border border-green-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-green-400"
              />
              <button type="button" onClick={() => setOpts(opts.filter((o) => o !== opt))} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button"
            onClick={() => setOpts([...opts, { text: '', isCorrect: true }])}
            className="text-xs text-green-600 hover:text-green-700 self-start">
            + To'g'ri javob qo'shish
          </button>
          <div className="mt-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400">AI uchun qo'shimcha ko'rsatma (ixtiyoriy):</p>
              <span className={`text-[10px] ${correctAnswer.length > 30 ? 'text-red-400' : 'text-gray-300'}`}>{correctAnswer.length}/30</span>
            </div>
            <input
              value={correctAnswer}
              onChange={(e) => { if (e.target.value.length <= 30) setCorrectAnswer(e.target.value); }}
              placeholder="Masalan: O'zbekiston poytaxti..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">Agar o'quvchi javobi yuqoridagi variantlarga mos kelmasa, AI shu ko'rsatma asosida tekshiradi.</p>
          </div>
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
