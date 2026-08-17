import { useState } from 'react';
import { X } from 'lucide-react';
import type { Group, PricingPlan } from '../../stores/courseStore';

interface CreatePricingPlanModalProps {
  groups: Group[];
  onConfirm: (plan: Omit<PricingPlan, 'id'>) => void;
  onClose: () => void;
  initialPlan?: PricingPlan;
}

const NAME_MAX = 65;

export function CreatePricingPlanModal({ groups, onConfirm, onClose, initialPlan }: CreatePricingPlanModalProps) {
  const [groupId, setGroupId] = useState<string>(initialPlan?.groupId ?? '');
  const [name, setName] = useState(initialPlan?.name ?? '');
  const [description, setDescription] = useState(initialPlan?.description ?? '');
  const [price, setPrice] = useState(initialPlan ? String(initialPlan.price) : '');
  const [originalPrice, setOriginalPrice] = useState(
    initialPlan?.originalPrice == null ? '' : String(initialPlan.originalPrice),
  );
  const [startDate, setStartDate] = useState(initialPlan?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(initialPlan?.endDate?.slice(0, 10) ?? '');

  const trimmedName = name.trim();
  const priceNum = Number(price);
  const canSubmit = trimmedName.length > 0 && price.trim() !== '' && !isNaN(priceNum) && priceNum >= 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm({
      name: trimmedName,
      description: description.trim(),
      price: priceNum,
      originalPrice: originalPrice.trim() === '' ? null : Number(originalPrice),
      groupId: groupId || null,
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-xs bg-black/25 dark:bg-black/60 p-0 sm:p-4 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl sm:max-w-md shadow-2xl text-[var(--text-primary)]">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
            {initialPlan ? 'Tarifni tahrirlash' : 'Tarif yaratish'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5 px-6 pb-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Guruh, qaysiga o'tkazish</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">Guruhsiz</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Tarif nomi</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              placeholder="Masalan: Bazaviy"
              className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">{name.length} / {NAME_MAX}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Tavsif</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Masalan, boshqa tariflardan farqi"
              rows={2}
              className="w-full resize-none rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Narx (UZS)</label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1000"
                className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Chegirmasiz narx</label>
              <input
                type="number"
                min={0}
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Ixtiyoriy"
                className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Boshlanish sanasi</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Tugash sanasi</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-2 w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
          >
            {initialPlan ? 'O‘zgarishlarni saqlash' : 'Tarif yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}
