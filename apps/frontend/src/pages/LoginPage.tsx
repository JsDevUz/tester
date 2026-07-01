import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  apiGetMe,
  apiRequestPasswordReset,
  apiRequestRegistration,
  apiVerifyPasswordReset,
  apiVerifyRegistration,
} from '../api/auth';

type AuthMode = 'login' | 'register' | 'reset';

export function LoginPage() {
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  const botLink = botUsername ? `https://t.me/${botUsername.replace('@', '')}` : '';
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [code, setCode] = useState('');
  const [registerCodeSent, setRegisterCodeSent] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
    setCode('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const me = await apiGetMe();
      useAuthStore.setState({ admin: me });
      navigate('/');
    } catch {
      setError('Email yoki parol noto\'g\'ri');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (!registerCodeSent) {
        await apiRequestRegistration({ name, email, phone });
        setRegisterCodeSent(true);
        setMessage("Kod Telegram botga yuborildi.");
      } else {
        await apiVerifyRegistration({ phone, code });
        setMessage("Login va parol Telegram botga yuborildi. Endi kirishingiz mumkin.");
        setMode('login');
        setPassword('');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Ro'yxatdan o'tib bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (!resetCodeSent) {
        await apiRequestPasswordReset(phoneOrEmail);
        setResetCodeSent(true);
        setMessage("Kod Telegram botga yuborildi.");
      } else {
        await apiVerifyPasswordReset({ phoneOrEmail, code });
        setMessage("Yangi parol Telegram botga yuborildi. Endi kirishingiz mumkin.");
        setMode('login');
        setPassword('');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Parolni tiklab bo\'lmadi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-800 mb-5 text-center">Test platforma</h1>
        <div className="grid grid-cols-3 gap-2 mb-5 rounded-lg bg-gray-100 p-1">
          {[
            ['login', 'Kirish'],
            ['register', "Ro'yxat"],
            ['reset', 'Parol'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value as AuthMode)}
              className={`rounded-md py-2 text-sm font-medium ${
                mode === value ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
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

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            {!registerCodeSent ? (
              <>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ism"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998..."
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </>
            ) : (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Telegram kod"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {registerCodeSent ? 'Tasdiqlash' : 'Kod olish'}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            {!resetCodeSent ? (
              <input
                value={phoneOrEmail}
                onChange={(e) => setPhoneOrEmail(e.target.value)}
                placeholder="Email yoki telefon"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
            ) : (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Telegram kod"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {resetCodeSent ? 'Tasdiqlash' : 'Kod olish'}
            </button>
          </form>
        )}

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
