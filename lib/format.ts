/** Indian-digit-grouping rupee formatter: 31200 → "₹31,200"; 100000 → "₹1,00,000" */
export function inr(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function dayLabel(monthLabel: string, day: number): string {
  return `${monthLabel} ${day}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function nextMonthLabel(monthLabel: string): string {
  const i = MONTHS.indexOf(monthLabel);
  return i === -1 ? monthLabel : MONTHS[(i + 1) % 12];
}
