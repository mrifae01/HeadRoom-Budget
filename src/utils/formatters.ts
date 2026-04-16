/** Format a number as a dollar string with exact cents. */
export function dollars(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "Mar 23" from an ISO date string */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

/** Today's date as "YYYY-MM-DD" */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** True if an ISO date string ("YYYY-MM-DD") falls in the current month */
export function isThisMonth(isoDate: string): boolean {
  const now = new Date();
  const d   = new Date(isoDate);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
