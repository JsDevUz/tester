import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Paperclip, Search, X } from "lucide-react";
import type { ApiPaymentRow } from "../../api/payments";
import { apiUploadMedia } from "../../api/questions";
import {
  type PaymentMethod,
  METHOD_LABEL,
  METHOD_OPTIONS,
  formatMoney,
  formatMonthLabel,
} from "./paymentUtils";

export function PaymentInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-700">{value}</p>
    </div>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function SelectField<TValue extends string>({
  value,
  onChange,
  options,
  getLabel = (option) => option,
  disabled = false,
}: {
  value: TValue;
  onChange: (value: TValue) => void;
  options: TValue[];
  getLabel?: (value: TValue) => string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        disabled={disabled}
        className="w-full appearance-none rounded-2xl bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-700 outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {getLabel(option)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
      />
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
    selectedRows.every((row) => amountForRow(row) > 0) &&
    (payFullAmount || numericAmount > 0) &&
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
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center sm:rounded-3xl">
          <p className="mb-4 text-sm text-gray-500">
            Hozircha to'lov kutilayotgan yozuv yo'q.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200 cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">
            To'lov qabul qilish
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-2 px-6 pb-6 sm:grid-cols-2">
          <Field label="Kutilayotgan to'lov" className="sm:col-span-2">
            <div className="rounded-2xl bg-gray-50 p-1.5">
              <div className="relative mb-1.5">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
                />
                <input
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="Ism, telefon yoki oy bo'yicha qidirish"
                  className="w-full rounded-xl bg-white py-2.5 pl-9 pr-3 text-sm outline-none"
                />
              </div>
              <div className="max-h-36 overflow-y-auto">
                <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(
                          Array.from(
                            new Set([
                              ...selectedIds,
                              ...filteredPayments.map((row) => row.id),
                            ]),
                          ),
                        );
                      } else {
                        const visibleIds = new Set(
                          filteredPayments.map((row) => row.id),
                        );
                        setSelectedIds((current) =>
                          current.filter((id) => !visibleIds.has(id)),
                        );
                      }
                    }}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  Barchasini tanlash ({filteredPayments.length})
                </label>
                {filteredPayments.map((row) => {
                  const selected = selectedIds.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? "bg-gray-100 text-gray-900"
                          : "hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setSelectedIds((current) =>
                            selected
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id],
                          )
                        }
                        className="h-4 w-4 accent-indigo-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {row.studentName}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {row.courseTitle} •{" "}
                          {formatMonthLabel(row.periodMonth)}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </Field>

          {selectedRow && (
            <div className="sm:col-span-2 rounded-2xl bg-gray-50 p-4 text-sm">
              <p className="font-semibold text-gray-800">
                {selectedRows.length > 1
                  ? `${selectedRows.length} ta o'quvchi tanlandi`
                  : selectedRow.studentName}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedRow.courseTitle} • {selectedRow.groupName} •{" "}
                {selectedRow.planName ?? "Tarifsiz"}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Kurs narxi: {formatMoney(selectedRow.expectedAmount)}
                {selectedRow.paidAmount > 0 &&
                  ` • Avval to'langan: ${formatMoney(selectedRow.paidAmount)}`}
              </p>
              <p className="mt-1 text-xs font-semibold text-gray-700">
                Kutilayotgan summa: {formatMoney(dueAfterDiscount)}
              </p>
            </div>
          )}

          <Field label="Summa">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={payFullAmount}
                onChange={(event) => setPayFullAmount(event.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
              Har bir o'quvchining to'liq summasi bilan
            </label>
            <input
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/[^\d\s]/g, ""))
              }
              disabled={payFullAmount}
              placeholder={
                payFullAmount
                  ? "Tarif bo'yicha avtomatik hisoblanadi"
                  : "300000"
              }
              className={`w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                amountTooHigh ? "ring-1 ring-red-400" : ""
              }`}
            />
            {!payFullAmount && amountTooHigh && (
              <p className="mt-1 text-xs text-red-500">
                Summa kutilayotgan to'lovdan ({formatMoney(dueAfterDiscount)})
                oshib ketmasligi kerak
              </p>
            )}
          </Field>
          <Field label="Chegirma (ixtiyoriy)">
            <input
              value={discount}
              onChange={(event) =>
                setDiscount(event.target.value.replace(/[^\d\s]/g, ""))
              }
              placeholder="0"
              className={`w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none ${
                discountTooHigh ? "ring-1 ring-red-400" : ""
              }`}
            />
            {discountTooHigh && (
              <p className="mt-1 text-xs text-red-500">
                Chegirma kurs narxidan (
                {formatMoney(selectedRow?.expectedAmount ?? 0)}) oshib ketmasligi
                kerak
              </p>
            )}
          </Field>
          <Field label="To'lov turi">
            <SelectField<PaymentMethod>
              value={method}
              onChange={setMethod}
              options={METHOD_OPTIONS}
              getLabel={(value) => METHOD_LABEL[value]}
              disabled={payFullAmount}
            />
          </Field>
          <Field label="To'lov sanasi">
            <input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none"
            />
          </Field>
          <Field label="Izoh" className="sm:col-span-2">
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ixtiyoriy izoh"
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none"
            />
          </Field>
          <Field label="Chek rasmi (ixtiyoriy)" className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500 hover:bg-gray-100">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePickReceipt}
              />
              <Paperclip size={16} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate">
                {receiptFile ? receiptFile.name : "Chek rasmini tanlang"}
              </span>
              {receiptFile && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setReceiptFile(null);
                  }}
                  className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </Field>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="sm:col-span-2 rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {uploadingReceipt
              ? "Chek yuklanmoqda..."
              : saving
                ? "Saqlanmoqda..."
                : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}
