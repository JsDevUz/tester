import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { apiVerifyPasswordResetCode } from "../api/auth";

const CODE_LENGTH = 6;

function maskUzPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
  return `+998${parts.length ? ` ${parts.join(" ")}` : " "}`;
}

export function LoginPage() {
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as
    string | undefined;
  const botLink = botUsername
    ? `tg://resolve?domain=${botUsername.replace("@", "")}`
    : "";
  const displayBot = botUsername
    ? botUsername.startsWith("@")
      ? botUsername
      : `@${botUsername}`
    : "@BirKodBot";
  const [phone, setPhone] = useState("+998 ");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<"code" | "password">("code");
  const [resetCode, setResetCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, loginWithTelegramCode, loginWithPasswordReset } = useAuthStore();
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const resetCodeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const codeDigits = useMemo(() => {
    const digits = code.slice(0, CODE_LENGTH).split("");
    return Array.from(
      { length: CODE_LENGTH },
      (_, index) => digits[index] ?? "",
    );
  }, [code]);
  const resetCodeDigits = useMemo(() => {
    const digits = resetCode.slice(0, CODE_LENGTH).split("");
    return Array.from({ length: CODE_LENGTH }, (_, index) => digits[index] ?? "");
  }, [resetCode]);

  useEffect(() => {
    if (token) {
      navigate(redirectTo, { replace: true });
      return;
    }
  }, [token]);

  useEffect(() => {
    if (showPasswordLogin || code.length !== CODE_LENGTH || loading) return;
    void submitTelegramCode();
  }, [code, showPasswordLogin]);

  useEffect(() => {
    if (!forgotMode || forgotStep !== "code" || resetCode.length !== CODE_LENGTH || loading) return;
    void verifyResetCode();
  }, [forgotMode, forgotStep, resetCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(phone, password);
      navigate(redirectTo);
    } catch (err: any) {
      const serverMessage = err?.response?.data?.message;
      toast.error(serverMessage ?? "Telefon yoki parol noto'g'ri");
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
    setLoading(true);
    try {
      await loginWithTelegramCode(code);
      navigate(redirectTo);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ?? "Kod noto'g'ri yoki muddati tugagan",
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyResetCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (resetCode.length !== CODE_LENGTH) return;
    setLoading(true);
    try {
      const result = await apiVerifyPasswordResetCode(resetCode);
      setResetToken(result.resetToken);
      setForgotStep("password");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Kod noto'g'ri yoki muddati tugagan");
    } finally {
      setLoading(false);
    }
  }

  function updateResetCodeDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...resetCodeDigits];
    next[index] = digit;
    setResetCode(next.join(""));
    if (digit && index < CODE_LENGTH - 1) resetCodeRefs.current[index + 1]?.focus();
  }

  function handleResetCodeKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !resetCodeDigits[index] && index > 0) {
      resetCodeRefs.current[index - 1]?.focus();
    }
  }

  function handleResetCodePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    setResetCode(pasted);
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    window.requestAnimationFrame(() => resetCodeRefs.current[focusIndex]?.focus());
  }

  async function completeReset(event: React.FormEvent) {
    event.preventDefault();
    if (resetPassword.length < 8) {
      toast.error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      toast.error("Parollar mos kelmadi");
      return;
    }
    setLoading(true);
    try {
      await loginWithPasswordReset(resetToken, resetPassword, resetPasswordConfirm);
      navigate(redirectTo);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Parolni yangilab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  function updateCodeDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...codeDigits];
    next[index] = digit;
    setCode(next.join(""));

    if (digit && index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, CODE_LENGTH);
    setCode(pasted);
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    window.requestAnimationFrame(() => codeRefs.current[focusIndex]?.focus());
  }

  return (
    <div className="login-page min-h-screen flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[560px] text-center">
        {forgotMode ? (
          forgotStep === "code" ? (
            <form onSubmit={verifyResetCode} className="flex flex-col items-center">
              <h1 className="login-title text-2xl font-black leading-none">Kodni Kiriting</h1>
              <p className="login-description mt-5 max-w-100 text-center text-sm font-medium leading-relaxed">
                <a href={botLink || `tg://resolve?domain=BirKodBot`} target="_blank" rel="noreferrer" className="login-bot-link mr-2 whitespace-nowrap underline decoration-2 underline-offset-4">{displayBot}</a>
                telegram botidan odatdagidek 6 xonali kodingizni oling.
              </p>
              <div className="mt-8 flex w-full justify-center gap-2">
                {resetCodeDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { resetCodeRefs.current[index] = node; }}
                    autoFocus={index === 0}
                    value={digit}
                    onChange={(event) => updateResetCodeDigit(index, event.target.value)}
                    onKeyDown={(event) => handleResetCodeKeyDown(index, event)}
                    onPaste={handleResetCodePaste}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    aria-label={`Tiklash kodi raqami ${index + 1}`}
                    className="login-code-input h-11 w-9 rounded-xl border text-center text-xl font-semibold outline-none transition"
                  />
                ))}
              </div>
              <button type="submit" disabled={loading || resetCode.length !== CODE_LENGTH} className="sr-only">{loading ? "Tekshirilmoqda..." : "Kodni tasdiqlash"}</button>
            </form>
          ) : (
            <form onSubmit={completeReset} className="flex flex-col gap-4">
              <h1 className="login-title text-2xl font-bold">Yangi parol</h1>
              <input autoFocus type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Yangi parol" className="login-admin-input rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400" />
              <input type="password" value={resetPasswordConfirm} onChange={(e) => setResetPasswordConfirm(e.target.value)} placeholder="Yangi parolni tasdiqlang" className="login-admin-input rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400" />
              <button type="submit" disabled={loading || !resetPassword || !resetPasswordConfirm} className="rounded-lg bg-indigo-500 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">{loading ? "Saqlanmoqda..." : "Parolni saqlash va kirish"}</button>
            </form>
          )
        ) : !showPasswordLogin && (
          <form
            onSubmit={handleTelegramLogin}
            className="flex flex-col items-center"
          >
            <h1 className="login-title text-2xl font-black leading-none">
              Kodni Kiriting
            </h1>
            <p className="login-description mt-5 max-w-100 text-center text-sm font-medium leading-relaxed">
              <a
                href={botLink || `tg://resolve?domain=BirKodBot`}
                target="_blank"
                rel="noreferrer"
                className="login-bot-link mr-2 whitespace-nowrap underline decoration-2 underline-offset-4"
              >
                {displayBot}
              </a>
              telegram botiga kiring va 10 daqiqalik kodingizni oling.
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
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Kod raqami ${index + 1}`}
                  className="login-code-input h-11 w-9 rounded-xl border text-center text-xl font-semibold outline-none transition"
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== CODE_LENGTH}
              className="sr-only"
            >
              {loading ? "Kirish..." : "Kirish"}
            </button>
            <a
              href={botLink || `tg://resolve?domain=BirKodBot`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: "#0088cc" }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M21.05 2.927a1.5 1.5 0 0 0-1.523-.267L2.6 9.29a1.5 1.5 0 0 0 .098 2.82l4.606 1.53 1.72 5.6a1.5 1.5 0 0 0 2.6.55l2.42-2.7 4.5 3.35a1.5 1.5 0 0 0 2.393-.91l2.05-13.9a1.5 1.5 0 0 0-.437-1.703ZM9.98 13.99l-1.02 3.32-.94-3.06 9.9-6.98-7.94 6.72Z" />
              </svg>
              Kodni qayta olish
            </a>
          </form>
        )}

        {!forgotMode && showPasswordLogin && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h1 className="login-title mb-2 text-2xl font-bold">
              Login bilan kirish
            </h1>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(maskUzPhone(e.target.value))}
              placeholder="Telefon raqami"
              inputMode="tel"
              autoComplete="tel"
              maxLength={17}
              className="login-admin-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parol"
              className="login-admin-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? "Kirish..." : "Kirish"}
            </button>
            <button type="button" onClick={() => { setForgotMode(true); setForgotStep("code"); }} className="login-toggle text-center text-xs font-medium">
              Parolni unutdim
            </button>
          </form>
        )}

        {!forgotMode && <button
          type="button"
          onClick={() => setShowPasswordLogin((value) => !value)}
          className="login-toggle mt-10 w-full text-center text-xs font-medium"
        >
          {showPasswordLogin
            ? "Telegram kod bilan kirish"
            : "Login bilan kirish"}
        </button>}
        {forgotMode && (
          <button type="button" onClick={() => setForgotMode(false)} className="login-toggle mt-10 w-full text-center text-xs font-medium">
            Login bilan kirish
          </button>
        )}

      </div>
    </div>
  );
}
