import { useState } from 'react';

interface Props {
  onSubmit: (email: string, password: string, name: string) => void;
  onClose: () => void;
}

export function AdminModal({ onSubmit, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) { setError('All fields required'); return; }
    onSubmit(email, password, name);
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h2 className="font-semibold text-gray-800 mb-4">Add Admin</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6)" type="password" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2 justify-end mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
