import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  Paperclip,
  Search,
  X,
  Check,
  ChevronDown,
  Calendar,
  DollarSign,
  Tag,
  FileText,
  UserCheck,
  Loader2,
  Wallet,
  Smartphone,
  Layers,
} from "lucide-react";
import type { ApiPaymentRow } from "../../api/payments";
import { apiUploadMedia } from "../../api/questions";
import {
  type PaymentMethod,
  METHOD_LABEL,
  METHOD_OPTIONS,
  formatMoney,
  formatMonthLabel,
} from "./paymentUtils";

const METHOD_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  cash: Wallet,
  click: Smartphone,
  payme: Smartphone,
  card: CreditCard,
  other: Layers,
};

function formatThousand(val: string | number | undefined): string {
  if (val === undefined || val === null) return "";
  const digits = String(val).replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ru-RU").replace(/,/g, " ");
}

export function PaymentInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--text-muted)] text-[11px] font-medium">{label}</p>
      <p className="mt-0.5 font-bold text-[var(--text-primary)] text-xs">{value}</p>
    </div>
  );
}

export function PaymentModal({
  rows,
  onSave,
  onClose,
}: {
  rows: ApiPaymentRow[];
  onSave: (
    paymentId: string,
    amount: number,
    method?: PaymentMethod,
    note?: string,
    receiptUrl?: string,
    discount?: number,
    paymentDate?: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const duePayments = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.removedAt &&
          (row.status === "pending" ||
            row.status === "partial" ||
            row.status === "debt"),
      ),
    [rows],
  );

  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    duePayments[0]?.id ? [duePayments[0].id] : [],
  );
  const [amount, setAmount] = useState("");
  const [payFullAmount, setPayFullAmount] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const selectedRows = duePayments.filter((row) =>
    selectedIds.includes(row.id),
  );
  const selectedRow = selectedRows[0] ?? null;
  const filteredPayments = duePayments.filter((row) =>
    `${row.studentName} ${row.studentPhone ?? ""} ${formatMonthLabel(row.periodMonth)}`
      .toLowerCase()
      .includes(studentQuery.trim().toLowerCase()),
  );
  const allVisibleSelected =
    filteredPayments.length > 0 &&
    filteredPayments.every((row) => selectedIds.includes(row.id));
  const numericAmount = Number(amount.replace(/\D/g, ""));
  const numericDiscount = discount
    ? Number(discount.replace(/\D/g, ""))
    : undefined;
  const discountTooHigh = selectedRows.some(
    (row) =>
      numericDiscount !== undefined && numericDiscount > row.expectedAmount,
  );
  const dueAfterDiscount = selectedRow
    ? Math.max(
        selectedRow.expectedAmount -
          (numericDiscount ?? selectedRow.discountAmount) -
          selectedRow.paidAmount,
        0,
      )
    : 0;
  const amountTooHigh = selectedRows.some(
    (row) =>
      row.expectedAmount > 0 &&
      numericAmount >
      Math.max(
        row.expectedAmount -
          (numericDiscount ?? row.discountAmount) -
          row.paidAmount,
        0,
      ),
  );
  const amountForRow = (row: ApiPaymentRow) =>
    payFullAmount
      ? Math.max(
          row.expectedAmount -
            (numericDiscount ?? row.discountAmount) -
            row.paidAmount,
          0,
        )
      : numericAmount;
  const canSave =
    selectedRows.length > 0 &&
    selectedRows.every((row) => (row.expectedAmount === 0 ? true : amountForRow(row) > 0)) &&
    (payFullAmount || numericAmount > 0 || selectedRows.every((r) => r.expectedAmount === 0)) &&
    (payFullAmount || !amountTooHigh) &&
    !discountTooHigh;

  function handlePickReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setReceiptFile(file);
    event.target.value = "";
  }

  async function handleSave() {
    if (!selectedRow || !canSave) return;
    setSaving(true);
    try {
      let receiptUrl: string | undefined;
      if (receiptFile) {
        setUploadingReceipt(true);
        const uploaded = await apiUploadMedia(receiptFile, "payments");
        receiptUrl = uploaded.url;
        setUploadingReceipt(false);
      }
      for (const row of selectedRows) {
        await onSave(
          row.id,
          amountForRow(row),
          method,
          note.trim() || undefined,
          receiptUrl,
          numericDiscount,
          paymentDate,
        );
      }
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? "Xato yuz berdi. Qayta urinib ko'ring.",
      );
    } finally {
      setSaving(false);
      setUploadingReceipt(false);
    }
  }

  if (duePayments.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="glass-card w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in-95 duration-150">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
            <UserCheck size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Barcha to'lovlar qabul qilingan</h3>
          <p className="mt-1 mb-5 text-xs font-medium text-[var(--text-muted)]">
            Hozircha to'lov kutilayotgan o'quvchi yo'q.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="glass-card flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                To'lov qabul qilish
              </h2>
              <p className="text-xs font-medium text-[var(--text-muted)]">
                Kutilayotgan to'lovni hisobga olish va chek biriktirish
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Section 1: Compact Searchable Student Combobox */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                O'quvchini tanlash
              </span>
              {selectedRows.length > 0 && (
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                  {selectedRows.length} ta tanlandi
                </span>
              )}
            </div>

            {/* Combobox Trigger Button */}
            <button
              type="button"
              onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-3 text-left transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {selectedRows.length > 1 ? selectedRows.length : selectedRow ? selectedRow.studentName.charAt(0).toUpperCase() : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                    {selectedRows.length > 1
                      ? `${selectedRows.length} ta o'quvchi tanlandi`
                      : selectedRow
                        ? selectedRow.studentName
                        : "O'quvchini tanlang..."}
                  </p>
                  {selectedRow && selectedRows.length === 1 && (
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {selectedRow.courseTitle} • {formatMonthLabel(selectedRow.periodMonth)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedRow && (
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {formatMoney(dueAfterDiscount)}
                  </span>
                )}
                <ChevronDown
                  size={16}
                  className={`text-[var(--text-muted)] transition-transform duration-200 ${
                    isStudentDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {/* Dropdown Menu */}
            {isStudentDropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-64 overflow-hidden rounded-2xl p-2.5 bg-[var(--surface-bg)] shadow-2xl border border-black/10 dark:border-white/10 animate-in fade-in zoom-in-95 duration-150">
                <div className="relative mb-2">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />
                  <input
                    autoFocus
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Ism, telefon yoki oy bo'yicha qidirish..."
                    className="w-full rounded-xl bg-black/5 dark:bg-white/10 py-2 pl-8 pr-3 text-xs font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (allVisibleSelected) {
                        const visibleIds = new Set(filteredPayments.map((r) => r.id));
                        setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)));
                      } else {
                        setSelectedIds(Array.from(new Set([...selectedIds, ...filteredPayments.map((r) => r.id)])));
                      }
                      setIsStudentDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <span>{allVisibleSelected ? "Tanlovni bekor qilish" : "Barchasini tanlash"}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">({filteredPayments.length} ta)</span>
                  </button>

                  {filteredPayments.map((row) => {
                    const isSelected = selectedIds.includes(row.id);
                    const remaining = Math.max(row.expectedAmount - row.discountAmount - row.paidAmount, 0);

                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => {
                          setSelectedIds([row.id]);
                          setIsStudentDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white font-bold"
                            : "hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-xs font-bold ${isSelected ? "text-white" : "text-[var(--text-primary)]"}`}>
                            {row.studentName}
                          </p>
                          <p className={`truncate text-[11px] font-medium ${isSelected ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                            {row.courseTitle} • {formatMonthLabel(row.periodMonth)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-indigo-600 dark:text-indigo-400"}`}>
                            {formatMoney(remaining)}
                          </span>
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                  {filteredPayments.length === 0 && (
                    <p className="py-4 text-center text-xs font-semibold text-[var(--text-muted)]">
                      O'quvchi topilmadi
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Selected Payment Summary Card */}
          {selectedRow && (
            <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {selectedRows.length > 1
                      ? `${selectedRows.length} ta o'quvchi tanlandi`
                      : selectedRow.studentName}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                    {selectedRow.courseTitle} • {selectedRow.groupName} • {selectedRow.planName ?? "Tarifsiz"}
                  </p>
                </div>
                <span className="rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Faol
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <p className="text-[10px] font-medium text-[var(--text-muted)]">Kurs narxi</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--text-primary)]">
                    {formatMoney(selectedRow.expectedAmount)}
                  </p>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <p className="text-[10px] font-medium text-[var(--text-muted)]">To'langan</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--text-primary)]">
                    {formatMoney(selectedRow.paidAmount)}
                  </p>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Kutilmoqda</p>
                  <p className="mt-0.5 text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                    {formatMoney(dueAfterDiscount)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Amount & Quick full toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                To'lov summasi
              </label>
              <button
                type="button"
                onClick={() => {
                  setPayFullAmount(!payFullAmount);
                  if (!payFullAmount && selectedRow) {
                    setAmount(formatThousand(dueAfterDiscount));
                  }
                }}
                className={`flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                  payFullAmount
                    ? "bg-indigo-600 text-white"
                    : "bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Check size={12} strokeWidth={3} className={payFullAmount ? "opacity-100" : "opacity-0"} />
                To'liq summani kiritish
              </button>
            </div>

            <div className="relative">
              <DollarSign
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-600 dark:text-indigo-400"
              />
              <input
                value={payFullAmount ? `${formatMoney(dueAfterDiscount)} (To'liq)` : amount}
                onChange={(event) => setAmount(formatThousand(event.target.value))}
                disabled={payFullAmount}
                placeholder="Masalan: 300 000"
                className={`w-full rounded-2xl bg-black/5 dark:bg-white/5 py-3 pl-10 pr-4 text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all ${
                  amountTooHigh ? "ring-2 ring-red-500 text-red-500" : ""
                }`}
              />
            </div>
            {!payFullAmount && amountTooHigh && (
              <p className="mt-1 text-[11px] font-semibold text-red-500">
                Kiritilgan summa kutilayotgan qarzdan ({formatMoney(dueAfterDiscount)}) oshib ketdi!
              </p>
            )}
          </div>

          {/* Section 4: Payment Method Pills (One-click selection) */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              To'lov turi
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {METHOD_OPTIONS.map((opt) => {
                const isSelected = method === opt;
                const Icon = METHOD_ICONS[opt];
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setMethod(opt)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-2.5 px-2 text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white scale-[1.02]"
                        : "bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-[11px] truncate">{METHOD_LABEL[opt]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 5: Discount & Payment Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                <Tag size={13} className="text-[var(--text-muted)]" />
                Chegirma (ixtiyoriy)
              </label>
              <input
                value={discount}
                onChange={(event) => setDiscount(formatThousand(event.target.value))}
                placeholder="0 so'm"
                className={`w-full rounded-2xl bg-black/5 dark:bg-white/5 py-2.5 px-3.5 text-xs font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all ${
                  discountTooHigh ? "ring-2 ring-red-500 text-red-500" : ""
                }`}
              />
              {discountTooHigh && (
                <p className="mt-1 text-[11px] font-semibold text-red-500">
                  Chegirma kurs narxidan oshmasligi kerak
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                <Calendar size={13} className="text-[var(--text-muted)]" />
                To'lov sanasi
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                className="w-full rounded-2xl bg-black/5 dark:bg-white/5 py-2.5 px-3.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
              />
            </div>
          </div>

          {/* Section 6: Note & Receipt Upload */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                <FileText size={13} className="text-[var(--text-muted)]" />
                Izoh
              </label>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Qo'shimcha izoh yoki kvitansiya raqami..."
                className="w-full rounded-2xl bg-black/5 dark:bg-white/5 py-2.5 px-3.5 text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                <Paperclip size={13} className="text-[var(--text-muted)]" />
                Chek rasmi
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePickReceipt}
                />
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Paperclip size={16} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                    {receiptFile ? receiptFile.name : "Chek faylini biriktirish (PNG, JPG)"}
                  </span>
                </div>
                {receiptFile ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setReceiptFile(null);
                    }}
                    className="shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-black/10 dark:hover:bg-white/10 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span className="rounded-lg bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                    Yuklash
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/5 dark:border-white/10 shrink-0 bg-black/5 dark:bg-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl px-5 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer transition-colors"
          >
            {uploadingReceipt ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Chek yuklanmoqda...</span>
              </>
            ) : saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Saqlanmoqda...</span>
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={2.5} />
                <span>To'lovni tasdiqlash</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
