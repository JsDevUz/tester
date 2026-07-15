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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">
            {initialPlan ? 'Tarifni tahrirlash' : 'Tarif yaratish'}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Guruh, qaysiga o'tkazish</p>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            >
              <option value="">Guruhsiz</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-sm text-gray-500">Tarif nomi</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              placeholder="Masalan: Bazaviy"
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{name.length} / {NAME_MAX}</p>
          </div>

          <div>
            <p className="mb-1.5 text-sm text-gray-500">Tavsif</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Masalan, boshqa tariflardan farqi"
              rows={2}
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Narx (UZS)</p>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1000"
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Chegirmasiz narx</p>
              <input
                type="number"
                min={0}
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Ixtiyoriy"
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Boshlanish sanasi</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Tugash sanasi</p>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-1 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            {initialPlan ? 'O‘zgarishlarni saqlash' : 'Tarif yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}
