import { useState } from 'react';
import { X } from 'lucide-react';

interface RecordPaymentModalProps {
  studentName: string;
  onConfirm: (amount: number, discount?: number) => void;
  onClose: () => void;
}

export function RecordPaymentModal({ studentName, onConfirm, onClose }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');

  const amountNum = Number(amount);
  const canSubmit = amount.trim() !== '' && !isNaN(amountNum) && amountNum > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    const discountNum = discount.trim() === '' ? undefined : Number(discount);
    onConfirm(amountNum, discountNum);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">To'lov qabul qilish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">{studentName}</p>

        <p className="mb-1.5 text-sm text-gray-500">Summa</p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
        />

        <p className="mb-1.5 text-sm text-gray-500">Chegirma (ixtiyoriy, faqat shu oy uchun)</p>
        <input
          type="number"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="0"
          className="mb-6 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
        >
          Tasdiqlash
        </button>
      </div>
    </div>
  );
}
