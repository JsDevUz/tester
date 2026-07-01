import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const CODE_LENGTH = 6;

export function LoginPage() {
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  const botLink = botUsername ? `tg://resolve?domain=${botUsername.replace('@', '')}` : '';
  const displayBot = botUsername ? (botUsername.startsWith('@') ? botUsername : `@${botUsername}`) : '@BirKodBot';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithTelegramCode } = useAuthStore();
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const codeDigits = useMemo(() => {
    const digits = code.slice(0, CODE_LENGTH).split('');
    return Array.from({ length: CODE_LENGTH }, (_, index) => digits[index] ?? '');
  }, [code]);

  useEffect(() => {
    if (token) { navigate('/', { replace: true }); return; }
  }, [token]);

  useEffect(() => {
    if (showPasswordLogin || code.length !== CODE_LENGTH || loading) return;
    void submitTelegramCode();
  }, [code, showPasswordLogin]);

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
    await submitTelegramCode();
  }

  async function submitTelegramCode() {
    if (code.length !== CODE_LENGTH || loading) return;
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

  function updateCodeDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...codeDigits];
    next[index] = digit;
    setCode(next.join(''));
    setError('');

    if (digit && index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(pasted);
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    window.requestAnimationFrame(() => codeRefs.current[focusIndex]?.focus());
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[560px] text-center">
        {!showPasswordLogin && (
          <form onSubmit={handleTelegramLogin} className="flex flex-col items-center">
            <h1 className="text-2xl font-black leading-none text-[#070d1d]">Kodni Kiriting</h1>
            <p className="mt-5 max-w-100 text-center text-sm font-medium leading-relaxed text-[#333746]">
              <a
                href={botLink || `tg://resolve?domain=BirKodBot`}
                target="_blank"
                rel="noreferrer"
                className="mr-2 whitespace-nowrap text-[#070d1d] underline decoration-2 underline-offset-4 hover:text-indigo-600"
              >
                {displayBot}
              </a>
              telegram botiga kiring va 1 daqiqalik kodingizni oling.
            </p>
            <div className="mt-8 flex w-full justify-center gap-2">
              {codeDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    codeRefs.current[index] = node;
                  }}
                  value={digit}
                  onChange={(e) => updateCodeDigit(index, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(index, e)}
                  onPaste={handleCodePaste}
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Kod raqami ${index + 1}`}
                  className="h-12 w-9 rounded-xl border-2 border-[#cfd1d4] bg-white text-center text-xl font-semibold text-[#070d1d] outline-none transition focus:border-[#070d1d]"
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== CODE_LENGTH}
              className="sr-only"
            >
              {loading ? 'Kirish...' : 'Kirish'}
            </button>
          </form>
        )}

        {showPasswordLogin && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Admin kirish</h1>
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
          className="mt-10 w-full text-center text-xs font-medium text-gray-300 hover:text-indigo-600"
        >
          {showPasswordLogin ? 'Telegram kod bilan kirish' : 'Admin parol bilan kirish'}
        </button>

        {(message || error) && (
          <div className="mt-5 space-y-2 text-center text-sm">
            {message && <p className="text-emerald-600">{message}</p>}
            {error && <p className="text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
