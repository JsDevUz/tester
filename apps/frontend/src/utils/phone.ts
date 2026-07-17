/** Ensures a stored phone number (digits only, e.g. "998901112233") displays with a leading "+". */
export function formatPhone(phone?: string | null): string | null {
  if (!phone) return null;
  return phone.startsWith('+') ? phone : `+${phone}`;
}
