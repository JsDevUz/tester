import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { apiGetSubmission, type SubmissionDetail } from '../api/submissions';

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);

  useEffect(() => {
    if (id) apiGetSubmission(id).then(setDetail);
  }, [id]);

  if (!detail) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">← Natijalar</button>
          <span className="text-gray-400">/</span>
          <h2 className="text-sm font-medium text-gray-700">{detail.studentName}</h2>
          <span className="ml-auto text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg">
            {detail.score} / {detail.total}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {detail.answers.map((a, i) => (
            <div key={a.questionId} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-2 mb-3">
                <span className="text-xs text-gray-400 mt-0.5">{i + 1}.</span>
                <p className="text-sm font-medium text-gray-800 flex-1">{a.questionText}</p>
                <span className="text-base shrink-0">
                  {a.isCorrect === true ? '✅' : a.isCorrect === false ? '❌' : '—'}
                </span>
              </div>

              {a.questionType === 'open' ? (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  {a.textAnswer ?? '(javob berilmagan)'}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {a.options.map((opt) => {
                    const studentSelected = a.selectedOptionIds.includes(opt.id);
                    const isCorrectOpt = a.correctOptionIds.includes(opt.id);
                    return (
                      <div key={opt.id} className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                        isCorrectOpt ? 'bg-green-50 text-green-700' :
                        studentSelected ? 'bg-red-50 text-red-600' :
                        'text-gray-500'
                      }`}>
                        <span>{studentSelected ? '●' : '○'}</span>
                        <span>{opt.text}</span>
                        {isCorrectOpt && <span className="ml-auto text-[10px]">✓ to'g'ri</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
