import { formatMoney, type Cents } from './money';

/** The percentage winners give back, as shown to people: "20%", "0.5%". */
export function givebackPercent(diff: Cents, totalWinnings: Cents): string {
  if (totalWinnings <= 0) return '0%';
  const pct = (diff / totalWinnings) * 100;
  return (pct < 1 ? Math.round(pct * 10) / 10 : Math.round(pct)) + '%';
}

/**
 * One plain sentence explaining any chip-count gap, or null if the count was exact.
 * `diff` is chips counted minus total buy-ins.
 */
export function describeAdjustment(diff: Cents, totalWinnings: Cents, bankerName: string): string | null {
  if (diff > 0) {
    return `Chips counted ${formatMoney(diff)} more than the total buy-ins, so the winners each gave back ${givebackPercent(diff, totalWinnings)} of their winnings to cover it.`;
  }
  if (diff < 0) {
    return `Chips counted ${formatMoney(-diff)} less than the total buy-ins. ${bankerName}, the banker, keeps the extra ${formatMoney(-diff)}.`;
  }
  return null;
}

export interface SummaryInput {
  dateLabel: string;
  totalCents: Cents;
  bankerName: string;
  bankerContact: string | null;
  results: { name: string; net: Cents }[];
  payments: { from: string; to: string; amount: Cents }[];
  note: string | null;
}

/** A clean text message for the group chat. */
export function summaryText(s: SummaryInput): string {
  const lines = [`Poker night, ${s.dateLabel}`, `${formatMoney(s.totalCents)} on the table`, ''];
  for (const r of s.results) lines.push(`${r.name}: ${r.net === 0 ? 'even' : formatMoney(r.net, { signed: true })}`);
  lines.push('');
  if (s.payments.length) {
    lines.push(`e-Transfers (${s.bankerName} is the banker${s.bankerContact ? `: ${s.bankerContact}` : ''})`);
    for (const p of s.payments) lines.push(`${p.from} sends ${p.to} ${formatMoney(p.amount)}`);
  } else {
    lines.push('Everyone broke even. Nobody owes anything.');
  }
  if (s.note) lines.push('', s.note);
  return lines.join('\n');
}
