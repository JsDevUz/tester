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
