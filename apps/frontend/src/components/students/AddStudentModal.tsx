import { useMemo, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";

interface AddStudentModalProps {
  onClose: () => void;
  onSubmit: (input: { name: string; phone: string; password: string }) => Promise<void>;
}

function maskUzPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
  return `+998${parts.length ? ` ${parts.join(" ")}` : " "}`;
}

function randomPassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%",
  ];
  const all = groups.join("");
  const pick = (chars: string) => {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return chars[value[0] % chars.length];
  };
  const characters = [...groups.map(pick), ...Array.from({ length: 6 }, () => pick(all))];
  for (let index = characters.length - 1; index > 0; index--) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    const swapIndex = value[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

export function AddStudentModal({ onClose, onSubmit }: AddStudentModalProps) {
  const defaultPassword = useMemo(() => randomPassword(), []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [password, setPassword] = useState(defaultPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !phone.trim() || !password) {
      setError("Barcha maydonlarni to'ldiring");
      return;
    }
    if (!/^\+998 \d{2} \d{3} \d{2} \d{2}$/.test(phone)) {
      setError("Telefon raqamini to'liq kiriting: +998 XX XXX XX XX");
      return;
    }
    if (password.length < 8) {
      setError("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), phone: phone.trim(), password });
    } catch (submitError: any) {
      setError(submitError?.response?.data?.message ?? "O'quvchini yaratib bo'lmadi");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-gray-900 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">O'quvchi qo'shish</h2>
            <p className="mt-1 text-xs text-gray-400">O'quvchi avtomatik ravishda maktabingizga qo'shiladi.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ism" maxLength={120} className="w-full rounded-xl border border-border bg-gray-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          <input value={phone} onChange={(event) => setPhone(maskUzPhone(event.target.value))} placeholder="+998 XX XXX XX XX" maxLength={17} inputMode="tel" autoComplete="tel" className="w-full rounded-xl border border-border bg-gray-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          <div className="relative">
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Parol" type={showPassword ? "text" : "password"} maxLength={128} className="w-full rounded-xl border border-border bg-gray-50 px-4 py-3 pr-11 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-40">Bekor qilish</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Yaratilmoqda..." : "Yaratish"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
