import { useState } from 'react';
import type { CreateTestData } from '../api/tests';

interface Props {
  folderId: string;
  onSubmit: (data: CreateTestData) => void;
  onClose: () => void;
  initial?: Partial<CreateTestData>;
  title?: string;
}

export function TestSettingsModal({ folderId, onSubmit, onClose, initial, title = 'Yangi test' }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [hasTimeLimit, setHasTimeLimit] = useState(!!initial?.timeLimit);
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimit ?? 30);
  const [showResults, setShowResults] = useState(initial?.showResults ?? 'immediately');
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initial?.shuffleOptions ?? false);
  const [oneByOne, setOneByOne] = useState(initial?.oneByOne ?? false);
  const [hasDeadline, setHasDeadline] = useState(!!initial?.deadline);
  const [deadline, setDeadline] = useState(initial?.deadline?.slice(0, 16) ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      folderId,
      name: name.trim(),
      description: description.trim() || undefined,
      timeLimit: hasTimeLimit ? timeLimit : undefined,
      showResults,
      shuffleQuestions,
      shuffleOptions,
      oneByOne,
      deadline: hasDeadline && deadline ? new Date(deadline).toISOString() : undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="font-semibold text-gray-800 mb-4 text-lg">{title}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Test nomi *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="masalan: Matematika" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tavsif</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} placeholder="Ixtiyoriy tavsif"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="hasTimeLimit" checked={hasTimeLimit} onChange={(e) => setHasTimeLimit(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="hasTimeLimit" className="text-sm text-gray-700">Vaqt chegarasi</label>
            {hasTimeLimit && (
              <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
            )}
            {hasTimeLimit && <span className="text-sm text-gray-500">daqiqa</span>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Natijalarni ko'rsatish</label>
            <select value={showResults} onChange={(e) => setShowResults(e.target.value as 'immediately' | 'after_deadline' | 'hidden')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="immediately">Topshirilgandan keyin darhol</option>
              <option value="after_deadline">Muddat tugagandan keyin</option>
              <option value="hidden">Ko'rsatilmasin</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={oneByOne} onChange={(e) => setOneByOne(e.target.checked)} className="w-4 h-4" />
              Savollarni birin-ketin ko'rsatish
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="w-4 h-4" />
              Savollar tartibini aralashtirish
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="w-4 h-4" />
              Javob variantlarini aralashtirish
            </label>
          </div>
          <div>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer mb-2">
              <input type="checkbox" checked={hasDeadline} onChange={(e) => setHasDeadline(e.target.checked)} className="w-4 h-4" />
              Muddat belgilash
            </label>
            {hasDeadline && (
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Bekor qilish</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
              {title === 'Yangi test' ? 'Yaratish va savollar qo\'shish' : 'Saqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
