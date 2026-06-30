import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { QuestionForm } from '../components/QuestionForm';
import { BulkImportTab } from '../components/BulkImportTab';
import { useQuestionStore } from '../stores/questionStore';
import { apiGetTest } from '../api/tests';
import type { TestDetail } from '../api/tests';

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

  async function handleAddQuestion(data: { text: string; type: string; options: Array<{ text: string; isCorrect: boolean }> }) {
    if (!testId) return;
    await addQuestion(testId, data);
  }

  async function handleBulkImport(text: string) {
    if (!testId) return 0;
    const count = await bulkImport(testId, text);
    const updated = await apiGetTest(testId);
    setQuestions(updated.questions);
    return count;
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

        {tab === 'manual' ? (
          <QuestionForm onSubmit={handleAddQuestion} />
        ) : (
          <BulkImportTab onImport={handleBulkImport} />
        )}

        {questions.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-gray-500">Savollar ({questions.length})</h3>
            {questions.map((q, i) => (
              <div key={q.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-gray-400 mr-2">{i + 1}.</span>
                    <span className="text-sm text-gray-800">{q.text}</span>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${
                      q.type === 'single' ? 'bg-blue-100 text-blue-600' :
                      q.type === 'multi' ? 'bg-purple-100 text-purple-600' :
                      'bg-gray-100 text-gray-500'}`}>
                      {q.type === 'single' ? 'Yagona' : q.type === 'multi' ? 'Ko\'p tanlov' : 'Ochiq'}
                    </span>
                  </div>
                  <button onClick={() => deleteQuestion(q.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                </div>
                {q.options.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {q.options.map((o) => (
                      <li key={o.id} className={`text-xs px-2 py-1 rounded-lg ${o.isCorrect ? 'bg-green-50 text-green-700' : 'text-gray-500'}`}>
                        {o.isCorrect ? '✓ ' : '○ '}{o.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
