import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Circle, Pencil, Trash2, X, Image, Music } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { QuestionForm } from '../components/QuestionForm';
import { BulkImportTab } from '../components/BulkImportTab';
import { useQuestionStore } from '../stores/questionStore';
import { apiGetTest } from '../api/tests';
import type { TestDetail } from '../api/tests';
import type { Question } from '../api/questions';

type SaveData = { text: string; type: string; options: Array<{ text: string; isCorrect: boolean }>; imageUrl?: string | null; audioUrl?: string | null };

interface InlineCardProps {
  index: number;
  question: Question;
  onSave: (data: SaveData) => Promise<void>;
  onDelete: () => void;
}

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
function mediaUrl(url: string) { return url.startsWith('http') ? url : `${BACKEND}${url}`; }

function InlineQuestionCard({ index, question: q, onSave, onDelete }: InlineCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(data: SaveData) {
    setSaving(true);
    await onSave(data);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400">{index + 1}. savol — tahrirlash</span>
          <button onClick={() => setEditing(false)} className="text-gray-300 hover:text-gray-500">
            <X size={16} />
          </button>
        </div>
        <QuestionForm
          key={q.id}
          initial={{
            text: q.text,
            type: q.type as 'single' | 'multi' | 'open',
            options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
          }}
          submitLabel={saving ? 'Saqlanmoqda...' : 'Saqlash'}
          onCancel={() => setEditing(false)}
          onSubmit={handleSave}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400 mr-2">{index + 1}.</span>
          <span className="text-sm text-gray-800">{q.text}</span>
          <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${
            q.type === 'single' ? 'bg-blue-100 text-blue-600' :
            q.type === 'multi' ? 'bg-purple-100 text-purple-600' :
            q.type === 'arrange' ? 'bg-amber-100 text-amber-600' :
            'bg-gray-100 text-gray-500'}`}>
            {q.type === 'single' ? 'Yagona' : q.type === 'multi' ? "Ko'p tanlov" : q.type === 'arrange' ? 'Gap tuzish' : 'Ochiq'}
          </span>
          {q.imageUrl && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-indigo-400"><Image size={10} /> rasm</span>}
          {q.audioUrl && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-purple-400"><Music size={10} /> audio</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(true)} className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {q.imageUrl && (
        <img src={mediaUrl(q.imageUrl)} alt="" className="mt-2 h-24 w-auto rounded-lg object-cover border border-gray-100" />
      )}
      {q.audioUrl && (
        <audio src={mediaUrl(q.audioUrl)} controls className="mt-2 h-8 w-full" />
      )}
      {q.type === 'arrange' && q.options.length > 0 ? (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1 mb-1">
            {q.options
              .filter((o) => o.isCorrect)
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((o, i) => (
                <span key={o.id} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-lg">
                  <span className="text-green-400 font-mono">{i + 1}.</span> {o.text}
                </span>
              ))}
          </div>
          {q.options.some((o) => !o.isCorrect) && (
            <div className="flex flex-wrap gap-1">
              {q.options.filter((o) => !o.isCorrect).map((o) => (
                <span key={o.id} className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-lg">{o.text}</span>
              ))}
            </div>
          )}
        </div>
      ) : q.options.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {q.options.map((o) => (
            <li key={o.id} className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 ${o.isCorrect ? 'bg-green-50 text-green-700' : 'text-gray-400'}`}>
              {o.isCorrect ? <Check size={10} /> : <Circle size={10} className="opacity-30" />}
              {o.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function QuestionEditorPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { questions, setQuestions, addQuestion, bulkImport, deleteQuestion } = useQuestionStore();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [tab, setTab] = useState<'manual' | 'bulk'>('manual');

  useEffect(() => {
    if (!testId) return;
    apiGetTest(testId).then((t) => {
      setTest(t);
      setQuestions(t.questions);
    });
  }, [testId]);

  async function handleAddQuestion(data: SaveData) {
    if (!testId) return;
    await addQuestion(testId, data);
  }

  async function handleSaveQuestion(q: Question, data: SaveData) {
    if (!testId) return;
    await deleteQuestion(q.id);
    await addQuestion(testId, data);
  }

  async function handleBulkImport(text: string) {
    if (!testId) return 0;
    const count = await bulkImport(testId, text);
    const updated = await apiGetTest(testId);
    setQuestions(updated.questions);
    return count;
  }

  function questionsToBulkText(): string {
    return questions.map((q) => {
      const lines: string[] = [`# ${q.text}`];
      if (q.type === 'open') return lines.join('\n');
      if (q.type === 'arrange') {
        const correct = [...q.options].filter((o) => o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
        const distractors = q.options.filter((o) => !o.isCorrect);
        for (const o of correct) lines.push(`> ${o.text}`);
        for (const o of distractors) lines.push(`~ ${o.text}`);
        return lines.join('\n');
      }
      for (const o of q.options) lines.push(`${o.isCorrect ? '+' : '-'} ${o.text}`);
      return lines.join('\n');
    }).join('\n\n');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(`/folders/${test?.folderId}`)} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Orqaga
          </button>
          <span className="text-gray-400">/</span>
          <h2 className="text-sm font-medium text-gray-700">{test?.name ?? 'Test'}</h2>
          <span className="text-xs text-gray-400 ml-auto">{questions.length} ta savol</span>
        </div>

        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-100 w-fit">
          {(['manual', 'bulk'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'manual' ? 'Qo\'lda kiritish' : 'Ommaviy import'}
            </button>
          ))}
        </div>

        <div>
          {tab === 'manual' ? (
            <QuestionForm key="new" onSubmit={handleAddQuestion} />
          ) : (
            <BulkImportTab onImport={handleBulkImport} bulkText={questionsToBulkText()} />
          )}
        </div>

        {questions.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-gray-500">Savollar ({questions.length})</h3>
            {questions.map((q, i) => (
              <InlineQuestionCard
                key={q.id}
                index={i}
                question={q}
                onSave={(data) => handleSaveQuestion(q, data)}
                onDelete={() => deleteQuestion(q.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
