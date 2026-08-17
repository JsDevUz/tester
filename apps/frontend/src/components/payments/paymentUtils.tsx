export type PaymentStatus = "paid" | "partial" | "debt" | "pending";
export type PaymentMethod = "cash" | "click" | "payme" | "card" | "other";
export type PaymentTab = "all" | PaymentStatus;

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Naqd",
  click: "Click",
  payme: "Payme",
  card: "Karta",
  other: "Boshqa",
};

export function formatMonthLabel(periodMonth: string): string {
  const date = new Date(periodMonth);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export const STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string; dot: string }
> = {
  paid: {
    label: "To'langan",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  partial: {
    label: "Qisman",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  debt: {
    label: "Qarzdor",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  pending: {
    label: "Kutilmoqda",
    className: "bg-slate-500/10 text-slate-600 dark:text-zinc-400",
    dot: "bg-slate-400",
  },
};

export const TABS: { key: PaymentTab; label: string }[] = [
  { key: "all", label: "Hammasi" },
  { key: "paid", label: "To'langan" },
  { key: "partial", label: "Qisman" },
  { key: "debt", label: "Qarzdorlar" },
  { key: "pending", label: "Kutilmoqda" },
];

export const METHOD_OPTIONS: PaymentMethod[] = [
  "cash",
  "click",
  "payme",
  "card",
  "other",
];

export function formatMoney(amount: number) {
  return `${new Intl.NumberFormat("uz-UZ").format(amount)} so'm`;
}

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
