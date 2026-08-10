import { useState } from 'react';

interface Props {
  onSubmit: (phone: string, password: string, name: string) => void;
  onClose: () => void;
}

export function AdminModal({ onSubmit, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !phone || !password) { setError('Barcha maydonlar to\'ldirilishi shart'); return; }
    onSubmit(phone, password, name);
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h2 className="font-semibold text-gray-800 mb-4">Admin qo'shish</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ism" className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon raqami" inputMode="tel" className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Parol (kamida 6 ta)" type="password" className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400" />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2 justify-end mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Bekor qilish</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">Qo'shish</button>
          </div>
        </form>
      </div>
    </div>
  );
}
