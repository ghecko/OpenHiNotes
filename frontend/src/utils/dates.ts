/**
 * Parse a timestamp coming from the backend.
 *
 * The API serialises `datetime.utcnow()` values without a timezone suffix
 * ("2026-09-24T09:12:03.123456"). `new Date()` treats such strings as LOCAL
 * time, which shifts every displayed time by the browser's UTC offset (2 h in
 * Zurich: a job started 40 s ago showed "120m 40s" in the queue panel). Treat
 * suffix-less timestamps as UTC; leave properly tagged ones untouched.
 */
export function parseServerDate(value: string | number | Date | null | undefined): Date {
  if (value === null || value === undefined) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const s = value.trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  return new Date(hasZone || !s.includes('T') ? s : `${s}Z`);
}
