// All money in the app is stored as whole cents (4775 = $47.75) to avoid rounding bugs.
export type Cents = number;

/** "47.75", "$50", " 1,200 " → cents. Empty or invalid → null. */
export function parseMoney(input: string | null | undefined): Cents | null {
  const cleaned = String(input ?? '').replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 5000 → "$50", 4775 → "$47.75", 4750 → "$47.50". With `signed`, adds + or −. */
export function formatMoney(cents: Cents, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = '$' + dollars.toLocaleString('en-CA') + (rem ? '.' + String(rem).padStart(2, '0') : '');
  if (cents < 0) return '−' + body;
  if (opts.signed && cents > 0) return '+' + body;
  return body;
}

/** Plain number for input fields and clipboard: 4775 → "47.75", 5000 → "50". */
export function moneyInputValue(cents: Cents | null | undefined): string {
  if (cents == null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
