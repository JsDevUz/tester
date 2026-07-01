import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  const botLink = botUsername ? `https://t.me/${botUsername.replace('@', '')}` : '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithTelegramCode } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Email yoki parol noto\'g\'ri');
    } finally {
      setLoading(false);
    }
  }

  async function handleTelegramLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await loginWithTelegramCode(code);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Kod noto'g'ri yoki muddati tugagan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-800 mb-5 text-center">Test platforma</h1>

        {!showPasswordLogin && (
          <form onSubmit={handleTelegramLogin} className="flex flex-col gap-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-center text-sm text-gray-600">
              {botUsername ? (
                <>
                  <a href={botLink} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 underline">
                    {botUsername.startsWith('@') ? botUsername : `@${botUsername}`}
                  </a>{' '}
                  botiga kiring, kontaktingizni yuboring va 1 daqiqalik kodni oling.
                </>
              ) : (
                "Telegram botga /start bosib kontaktingizni yuboring va 1 daqiqalik kodni oling."
              )}
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Telegram kod"
              inputMode="numeric"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? 'Kirish...' : 'Kirish'}
            </button>
          </form>
        )}

        {showPasswordLogin && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email yoki telefon"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parol"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? 'Kirish...' : 'Kirish'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setShowPasswordLogin((value) => !value);
            setError('');
            setMessage('');
          }}
          className="mt-4 w-full text-center text-xs font-medium text-gray-400 hover:text-indigo-600"
        >
          {showPasswordLogin ? 'Telegram kod bilan kirish' : 'Admin parol bilan kirish'}
        </button>

        {(botUsername || message || error) && (
          <div className="mt-4 space-y-2 text-center text-sm">
            {botUsername && (
              <a href={botLink} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-700">
                {botUsername.startsWith('@') ? botUsername : `@${botUsername}`}
              </a>
            )}
            {message && <p className="text-emerald-600">{message}</p>}
            {error && <p className="text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
