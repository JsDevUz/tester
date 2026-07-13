import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  Image as ImageIcon,
  Info,
  Paperclip,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { AppShell } from "../components/AppShell";
import { apiListAllPayments, apiRecordPayment, apiCancelPayment, type ApiPaymentRow } from "../api/payments";
import { apiUploadMedia } from "../api/questions";

type PaymentStatus = "paid" | "partial" | "debt" | "pending";
type PaymentMethod = "cash" | "click" | "payme" | "card" | "other";
type PaymentTab = "all" | PaymentStatus;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Naqd",
  click: "Click",
  payme: "Payme",
  card: "Karta",
  other: "Boshqa",
};

function formatMonthLabel(periodMonth: string): string {
  const date = new Date(periodMonth);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string; dot: string }
> = {
  paid: {
    label: "To'langan",
    className: "bg-green-50 text-green-600",
    dot: "bg-green-500",
  },
  partial: {
    label: "Qisman",
    className: "bg-amber-50 text-amber-600",
    dot: "bg-amber-500",
  },
  debt: {
    label: "Qarzdor",
    className: "bg-red-50 text-red-500",
    dot: "bg-red-500",
  },
  pending: {
    label: "Kutilmoqda",
    className: "bg-indigo-50 text-indigo-600",
    dot: "bg-indigo-500",
  },
};

const TABS: { key: PaymentTab; label: string; info?: boolean }[] = [
  { key: "all", label: "Hammasi" },
  { key: "paid", label: "To'langan" },
  { key: "partial", label: "Qisman", info: true },
  { key: "debt", label: "Qarzdorlar", info: true },
  { key: "pending", label: "Kutilmoqda", info: true },
];

const METHOD_OPTIONS: PaymentMethod[] = ["cash", "click", "payme", "card", "other"];

function formatMoney(amount: number) {
  return `${new Intl.NumberFormat("uz-UZ").format(amount)} so'm`;
}

function StatusBadge({ status }: { status: PaymentStatus }) {
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

export function PaymentsPage() {
  const [rows, setRows] = useState<ApiPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PaymentTab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function refresh() {
    return apiListAllPayments().then(setRows);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const courseOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.courseTitle))).sort(),
    [rows],
  );
  const yearOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => new Date(row.periodMonth).getUTCFullYear())))
        .sort((a, b) => b - a),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const tabMatch = activeTab === "all" || row.status === activeTab;
      const searchMatch =
        !q ||
        `${row.studentName} ${row.studentPhone ?? ""} ${row.courseTitle} ${row.groupName}`
          .toLowerCase()
          .includes(q);
      const date = new Date(row.periodMonth);
      const monthMatch = !monthFilter || String(date.getUTCMonth() + 1).padStart(2, "0") === monthFilter;
      const yearMatch = !yearFilter || String(date.getUTCFullYear()) === yearFilter;
      const courseMatch = !courseFilter || row.courseTitle === courseFilter;
      return tabMatch && searchMatch && monthMatch && yearMatch && courseMatch;
    });
  }, [activeTab, query, rows, monthFilter, yearFilter, courseFilter]);

  const dueAmount = (row: ApiPaymentRow) => row.expectedAmount - row.discountAmount;
  const paidTotal = rows.reduce((sum, row) => sum + row.paidAmount, 0);
  const debtTotal = rows.reduce(
    (sum, row) => sum + Math.max(dueAmount(row) - row.paidAmount, 0),
    0,
  );
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const debtCount = rows.filter((row) => row.status === "debt").length;

  async function handleCancelPayment(paymentId: string) {
    setCancellingId(paymentId);
    try {
      await apiCancelPayment(paymentId);
      await refresh();
    } finally {
      setCancellingId(null);
    }
  }

  async function handleRecordPayment(
    paymentId: string,
    amount: number,
    method?: PaymentMethod,
    note?: string,
    receiptUrl?: string,
  ) {
    await apiRecordPayment(paymentId, amount, undefined, method, note, receiptUrl);
    await refresh();
    setModalOpen(false);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="rounded-2xl bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-800">To'lovlar</h1>
              <p className="mt-0.5 text-xs text-gray-400">
                O'quvchilar to'lovlari, qarzdorlik va oylik tushumlar
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
              >
                <Download size={16} />
                Eksport
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
              >
                <CreditCard size={16} />
                To'lov qabul qilish
              </button>
            </div>
          </div>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1">
            <SummaryCard
              icon={Banknote}
              title="Oylik tushum"
              value={formatMoney(paidTotal)}
              trend="+ 12%"
              tone="orange"
              highlighted
            />
            <SummaryCard
              icon={AlertCircle}
              title="Qarzdorlik"
              value={formatMoney(debtTotal)}
              trend={`${debtCount} ta`}
              tone="red"
            />
            <SummaryCard
              icon={CalendarDays}
              title="Kutilayotgan"
              value={`${pendingCount} ta`}
              trend="+ 4%"
              tone="indigo"
            />
            <SummaryCard
              icon={WalletCards}
              title="Qisman to'lov"
              value={`${rows.filter((row) => row.status === "partial").length} ta`}
              trend="- 5%"
              tone="amber"
            />
          </div>

          <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-gray-50 p-1">
            <div className="flex w-max gap-1.5">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                const count =
                  tab.key === "all"
                    ? rows.length
                    : rows.filter((row) => row.status === tab.key).length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-white text-[var(--color-indigo-500)]"
                        : "text-gray-900 hover:bg-white/60"
                    }`}
                  >
                    <span>
                      {tab.label} ({count.toLocaleString("uz-UZ")})
                    </span>
                    {tab.info && (
                      <Info size={14} className="text-gray-400" />
                    )}
                  </button>
                );
              })}
            </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-fit max-w-full">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="O'quvchi, telefon yoki kurs bo'yicha qidirish..."
                  className="w-[min(420px,calc(100vw-2rem))] rounded-xl bg-gray-50 py-2.5 pl-10 pr-4 text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
                />
              </div>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="rounded-xl bg-gray-50 py-2.5 px-3 text-sm font-medium text-gray-700 outline-none"
              >
                <option value="">Barcha kurslar</option>
                {courseOptions.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="rounded-xl bg-gray-50 py-2.5 px-3 text-sm font-medium text-gray-700 outline-none"
              >
                <option value="">Barcha oylar</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="rounded-xl bg-gray-50 py-2.5 px-3 text-sm font-medium text-gray-700 outline-none"
              >
                <option value="">Barcha yillar</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

          <div className="hidden overflow-x-auto rounded-2xl bg-white md:block">
            <table className="w-full min-w-[920px] text-left">
              <thead className="text-sm font-semibold text-gray-400">
                <tr>
                  <th className="px-4 py-4">O'quvchi</th>
                  <th className="px-4 py-4">Kurs / guruh</th>
                  <th className="px-4 py-4">Oy</th>
                  <th className="px-4 py-4">Summa</th>
                  <th className="px-4 py-4">To'langan</th>
                  <th className="px-4 py-4">Holat</th>
                  <th className="px-4 py-4">Sana</th>
                  <th className="px-4 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-50 transition-colors hover:bg-indigo-50/40"
                  >
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-gray-800">
                        {row.studentName}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {row.studentPhone ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-medium text-gray-700">
                        {row.courseTitle}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {row.groupName} • {row.planName ?? "Tarifsiz"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">
                      {formatMonthLabel(row.periodMonth)}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-700">
                      {formatMoney(dueAmount(row))}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-gray-700">
                        {formatMoney(row.paidAmount)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {row.paymentMethod ? METHOD_LABEL[row.paymentMethod as PaymentMethod] : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">
                      <p>{new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.updatedAt))}</p>
                      {row.receiptUrl && (
                        <a
                          href={row.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:underline"
                        >
                          <ImageIcon size={12} /> Chek
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {(row.status === "paid" || row.status === "partial") && (
                        <button
                          type="button"
                          onClick={() => void handleCancelPayment(row.id)}
                          disabled={cancellingId === row.id}
                          className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cancellingId === row.id ? "..." : "Bekor qilish"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 md:hidden">
            {filtered.map((row) => (
              <div key={row.id} className="rounded-2xl bg-gray-50 p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-800">
                      {row.studentName}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{row.studentPhone ?? ""}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <PaymentInfo label="Kurs" value={row.courseTitle} />
                  <PaymentInfo label="Guruh" value={row.groupName} />
                  <PaymentInfo label="Oy" value={formatMonthLabel(row.periodMonth)} />
                  <PaymentInfo label="To'lov" value={formatMoney(row.paidAmount)} />
                </div>
                {(row.status === "paid" || row.status === "partial") && (
                  <button
                    type="button"
                    onClick={() => void handleCancelPayment(row.id)}
                    disabled={cancellingId === row.id}
                    className="mt-3 w-full rounded-xl bg-red-50 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cancellingId === row.id ? "..." : "Bekor qilish"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && (
        <PaymentModal
          rows={rows}
          onSave={handleRecordPayment}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  trend,
  tone,
  highlighted = false,
}: {
  icon: typeof CreditCard;
  title: string;
  value: string;
  trend: string;
  tone: "orange" | "red" | "indigo" | "amber";
  highlighted?: boolean;
}) {
  const iconClass = {
    orange: highlighted ? "bg-white/20 text-white" : "bg-orange-50 text-orange-500",
    red: "bg-red-50 text-red-500",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
  }[tone];
  const trendClass =
    tone === "red" || tone === "amber"
      ? highlighted
        ? "bg-white/20 text-white"
        : "bg-red-50 text-red-500"
      : highlighted
        ? "bg-white/20 text-white"
        : "bg-green-50 text-green-600";

  return (
    <div
      className={`min-w-40 flex-1 rounded-2xl p-2.5 ${
        highlighted
          ? "bg-[var(--color-indigo-500)] text-white"
          : "bg-white text-gray-900"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold ${
            highlighted ? "text-white" : "text-gray-700"
          }`}
        >
          {title}
        </p>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          <Icon size={14} />
        </div>
      </div>
      <p className={`text-xl font-semibold ${highlighted ? "text-white" : "text-gray-900"}`}>
        {value}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${trendClass}`}>
          {trend}
        </span>
        <span className={`text-[10px] ${highlighted ? "text-white/80" : "text-gray-400"}`}>
          Shu oy
        </span>
      </div>
    </div>
  );
}

function PaymentInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-700">{value}</p>
    </div>
  );
}

function PaymentModal({
  rows,
  onSave,
  onClose,
}: {
  rows: ApiPaymentRow[];
  onSave: (paymentId: string, amount: number, method?: PaymentMethod, note?: string, receiptUrl?: string) => Promise<void>;
  onClose: () => void;
}) {
  const duePayments = useMemo(
    () => rows.filter((row) => row.status === "pending" || row.status === "partial" || row.status === "debt"),
    [rows],
  );

  const [studentQuery, setStudentQuery] = useState("");
  const [selectedId, setSelectedId] = useState(duePayments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedRow = duePayments.find((row) => row.id === selectedId) ?? null;
  const filteredPayments = duePayments.filter((row) =>
    `${row.studentName} ${row.studentPhone ?? ""} ${formatMonthLabel(row.periodMonth)}`
      .toLowerCase()
      .includes(studentQuery.trim().toLowerCase()),
  );
  const numericAmount = Number(amount.replace(/\D/g, ""));
  const canSave = !!selectedRow && numericAmount > 0;

  function handlePickReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setReceiptFile(file);
    event.target.value = "";
  }

  async function handleSave() {
    if (!selectedRow || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      let receiptUrl: string | undefined;
      if (receiptFile) {
        setUploadingReceipt(true);
        const uploaded = await apiUploadMedia(receiptFile, "payments");
        receiptUrl = uploaded.url;
        setUploadingReceipt(false);
      }
      await onSave(selectedRow.id, numericAmount, method, note.trim() || undefined, receiptUrl);
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? "Xato yuz berdi. Qayta urinib ko'ring.");
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
            className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
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
          <h2 className="text-lg font-bold text-gray-800">To'lov qabul qilish</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-3 px-6 pb-6 sm:grid-cols-2">
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
                {filteredPayments.map((row) => {
                  const selected = selectedId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        selected ? "bg-indigo-50 text-indigo-600" : "hover:bg-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {row.studentName}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {row.courseTitle} • {formatMonthLabel(row.periodMonth)}
                        </p>
                      </div>
                      {selected && <Check size={16} className="text-indigo-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </Field>

          {selectedRow && (
            <div className="sm:col-span-2 rounded-2xl bg-gray-50 p-4 text-sm">
              <p className="font-semibold text-gray-800">{selectedRow.studentName}</p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedRow.courseTitle} • {selectedRow.groupName} • {selectedRow.planName ?? "Tarifsiz"}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Kutilayotgan summa: {formatMoney(selectedRow.expectedAmount - selectedRow.discountAmount - selectedRow.paidAmount)}
              </p>
            </div>
          )}

          <Field label="Summa">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="300000"
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none"
            />
          </Field>
          <Field label="To'lov turi">
            <SelectField<PaymentMethod>
              value={method}
              onChange={setMethod}
              options={METHOD_OPTIONS}
              getLabel={(value) => METHOD_LABEL[value]}
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
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500 hover:bg-gray-100">
              <input type="file" accept="image/*" className="hidden" onChange={handlePickReceipt} />
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
          {saveError && (
            <p className="sm:col-span-2 text-sm font-semibold text-red-500">{saveError}</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="sm:col-span-2 rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploadingReceipt ? "Chek yuklanmoqda..." : saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
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

function SelectField<TValue extends string>({
  value,
  onChange,
  options,
  getLabel = (option) => option,
}: {
  value: TValue;
  onChange: (value: TValue) => void;
  options: TValue[];
  getLabel?: (value: TValue) => string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        className="w-full appearance-none rounded-2xl bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-700 outline-none"
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
