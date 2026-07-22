import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Submission } from "../api/submissions";
import { formatDateTime, formatElapsedDuration } from "./date";

// Natijalar ro'yxatini bitta PDF jadvaliga yig'ib, brauzerda yuklab olishni
// ishga tushiradi. jsPDF standart shriftlari kirill/lotin o'zbekcha
// belgilarni to'liq qo'llab-quvvatlamaydi — shuning uchun matnlar autoTable
// ichida to'g'ridan-to'g'ri UTF-8 sifatida chiziladi (jsPDF v4 WinAnsi emas,
// Unicode-safe helvetica fallback ishlatadi).
export function exportSubmissionsToPdf(testName: string, submissions: Submission[]): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text(`${testName} — Natijalar`, 40, 40);

  const rows = submissions.map((sub) => {
    const pct = sub.total ? Math.round(((sub.score ?? 0) / sub.total) * 100) : 0;
    const elapsed = sub.submittedAt ? formatElapsedDuration(sub.startedAt, sub.submittedAt) : "—";
    return [
      sub.studentName,
      sub.submittedAt ? formatDateTime(sub.submittedAt) : "Topshirilmagan",
      elapsed,
      `${pct}%`,
      `${sub.score ?? 0}/${sub.total ?? 0}`,
      sub.mode === "violation" ? "Taqiqlangan harakat" : "",
    ];
  });

  autoTable(doc, {
    startY: 56,
    head: [["O'quvchi", "Topshirgan vaqti", "Ishlash vaqti", "Foiz", "Ball", "Izoh"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`${testName.replace(/[^\w\-]+/g, "_")}-natijalar.pdf`);
}
