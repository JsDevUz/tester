import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CreditCard,
  Download,
  Image as ImageIcon,
  Search,
  WalletCards,
} from "lucide-react";
import { AppShell } from "../components/AppShell";
import { ImageLightbox } from "../components/student/ImageLightbox";
import {
  apiListAllPayments,
  apiRecordPayment,
  apiCancelPayment,
  type ApiPaymentRow,
} from "../api/payments";
import {
  type PaymentMethod,
  type PaymentTab,
  METHOD_LABEL,
  TABS,
  formatMoney,
  formatMonthLabel,
  StatusBadge,
} from "../components/payments/paymentUtils";
import { SummaryCard } from "../components/payments/PaymentSummaryCards";
import { PaymentModal, PaymentInfo } from "../components/payments/PaymentModal";

export function PaymentsPage() {
  const [rows, setRows] = useState<ApiPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PaymentTab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [yearFilter, setYearFilter] = useState(String(now.getFullYear()));
  const [courseFilter, setCourseFilter] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ src: string; alt: string } | null>(null);

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
      Array.from(new Set([now.getFullYear(), ...rows.map((row) => new Date(row.periodMonth).getUTCFullYear())]))
        .sort((a, b) => b - a),
    [rows],
  );

  const dateFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const searchMatch =
        !q ||
        `${row.studentName} ${row.studentPhone ?? ""} ${row.courseTitle} ${row.groupName}`
          .toLowerCase()
          .includes(q);
      const date = new Date(row.periodMonth);
      const monthMatch = !monthFilter || String(date.getUTCMonth() + 1).padStart(2, "0") === monthFilter;
      const yearMatch = !yearFilter || String(date.getUTCFullYear()) === yearFilter;
      const courseMatch = !courseFilter || row.courseTitle === courseFilter;
      return searchMatch && monthMatch && yearMatch && courseMatch;
    });
  }, [query, rows, monthFilter, yearFilter, courseFilter]);

  const filtered = useMemo(
    () => dateFiltered.filter((row) => activeTab === "all" || row.status === activeTab),
    [dateFiltered, activeTab],
  );

  const dueAmount = (row: ApiPaymentRow) => row.expectedAmount - row.discountAmount;
  const activeRows = dateFiltered.filter((row) => !row.removedAt);
  const paidTotal = dateFiltered.reduce((sum, row) => sum + row.paidAmount, 0);
  const debtTotal = activeRows.reduce(
    (sum, row) => sum + Math.max(dueAmount(row) - row.paidAmount, 0),
    0,
  );
  const pendingCount = activeRows.filter((row) => row.status === "pending").length;
  const debtCount = activeRows.filter((row) => row.status === "debt").length;

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
    discount?: number,
    paymentDate?: string,
  ) {
    await apiRecordPayment(paymentId, amount, discount, method, note, receiptUrl, paymentDate);
    await refresh();
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
      <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-3">
          {/* Top Header */}
          <div className="flex flex-col gap-3 px-1 py-1 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">To'lovlar</h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                O'quvchilar to'lovlari, qarzdorlik va oylik tushumlar
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--surface-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
              >
                <Download size={15} />
                Eksport
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
              >
                <CreditCard size={15} />
                To'lov qabul qilish
              </button>
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
              tone={debtTotal > 0 ? "red" : "neutral"}
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
              value={`${activeRows.filter((row) => row.status === "partial").length} ta`}
              trend={`${activeRows.filter((row) => row.status === "partial").length} ta`}
              tone="neutral"
            />
          </div>

          <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-[var(--card-bg)] p-1">
            <div className="flex w-max gap-1">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                const count =
                  tab.key === "all"
                    ? dateFiltered.length
                    : dateFiltered.filter((row) => row.status === tab.key).length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs transition-all cursor-pointer ${
                      active
                        ? "bg-[var(--surface-bg)] text-[var(--text-primary)] font-bold shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] font-semibold"
                    }`}
                  >
                    <span>
                      {tab.label} ({count.toLocaleString("uz-UZ")})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-fit max-w-full">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="O'quvchi, telefon yoki kurs bo'yicha qidirish..."
                className="w-[min(420px,calc(100vw-2rem))] rounded-xl bg-[var(--surface-bg)] py-2 pl-9 pr-4 text-xs font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="rounded-xl bg-[var(--surface-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
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
              className="rounded-xl bg-[var(--surface-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
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
              className="rounded-xl bg-[var(--surface-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">Barcha yillar</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden overflow-x-auto rounded-2xl bg-[var(--surface-bg)] shadow-xs md:block">
            <table className="w-full min-w-[920px] text-left border-collapse">
              <thead className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3.5">O'quvchi</th>
                  <th className="px-4 py-3.5">Kurs / guruh</th>
                  <th className="px-4 py-3.5">Oy</th>
                  <th className="px-4 py-3.5">Summa</th>
                  <th className="px-4 py-3.5">To'langan</th>
                  <th className="px-4 py-3.5">Holat</th>
                  <th className="px-4 py-3.5">Sana</th>
                  <th className="px-4 py-3.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-[var(--card-hover)]"
                  >
                    <td className="px-4 py-3.5">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                        {row.studentName}
                        {row.removedAt && (
                          <span className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                            Chetlashtirilgan
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {row.studentPhone ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {row.courseTitle}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {row.groupName} • {row.planName ?? "Tarifsiz"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-secondary)]">
                      {formatMonthLabel(row.periodMonth)}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-bold text-[var(--text-primary)]">
                      {formatMoney(dueAmount(row))}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {formatMoney(row.paidAmount)}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {row.paymentMethod ? METHOD_LABEL[row.paymentMethod as PaymentMethod] : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-secondary)]">
                      <p>{new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.updatedAt))}</p>
                      {row.receiptUrl && (
                        <button
                          type="button"
                          onClick={() => setReceiptPreview({
                            src: row.receiptUrl!,
                            alt: `${row.studentName} — to'lov cheki`,
                          })}
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          <ImageIcon size={12} /> Chek
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {(row.status === "paid" || row.status === "partial") && (
                        <button
                          type="button"
                          onClick={() => void handleCancelPayment(row.id)}
                          disabled={cancellingId === row.id}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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

          <div className="flex flex-col gap-2 rounded-2xl bg-[var(--surface-bg)] p-3 md:hidden">
            {filtered.map((row) => (
              <div key={row.id} className="rounded-2xl bg-[var(--card-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                      {row.studentName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{row.studentPhone ?? ""}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <PaymentInfo label="Kurs" value={row.courseTitle} />
                  <PaymentInfo label="Guruh" value={row.groupName} />
                  <PaymentInfo label="Oy" value={formatMonthLabel(row.periodMonth)} />
                  <PaymentInfo label="To'lov" value={formatMoney(row.paidAmount)} />
                </div>
                {row.receiptUrl && (
                  <button
                    type="button"
                    onClick={() => setReceiptPreview({
                      src: row.receiptUrl!,
                      alt: `${row.studentName} — to'lov cheki`,
                    })}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-bg)] py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                  >
                    <ImageIcon size={14} /> Chekni ko'rish
                  </button>
                )}
                {(row.status === "paid" || row.status === "partial") && (
                  <button
                    type="button"
                    onClick={() => void handleCancelPayment(row.id)}
                    disabled={cancellingId === row.id}
                    className="mt-3 w-full rounded-xl bg-[var(--surface-bg)] py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
      {receiptPreview && (
        <ImageLightbox
          src={receiptPreview.src}
          alt={receiptPreview.alt}
          onClose={() => setReceiptPreview(null)}
        />
      )}
    </AppShell>
  );
}
