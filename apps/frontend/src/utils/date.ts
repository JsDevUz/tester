function toDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatDate(value: string | number | Date) {
  const date = toDate(value);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatDateTime(value: string | number | Date) {
  const date = toDate(value);
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Ikki timestamp orasidagi farqni "s:dd:ss" (soat bo'lsa) yoki "d:ss" (bo'lmasa)
// formatida qaytaradi — testni ishlash uchun sarflangan vaqtni ko'rsatish uchun.
export function formatElapsedDuration(startValue: string | number | Date, endValue: string | number | Date): string {
  const start = toDate(startValue).getTime();
  const end = toDate(endValue).getTime();
  const totalSec = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
