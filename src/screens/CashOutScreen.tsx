import { useState, type KeyboardEvent } from 'react';
import { useAct, useDb } from '../app/StoreContext';
import { MoneyInput } from '../components/MoneyInput';
import { formatMoney, moneyInputValue, parseMoney, type Cents } from '../lib/money';
import { playerById, potFor, seatsFor } from '../lib/select';
import { settle } from '../lib/settle';
import { describeAdjustment } from '../lib/summary';
import type { Game } from '../lib/types';

export function CashOutScreen({ game }: { game: Game }) {
  const db = useDb();
  const act = useAct();
  // What's typed but not yet saved, per player. Saved values come from the store.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const total = potFor(db, game.id);
  const seats = seatsFor(db, game.id).filter((s) => s.totalIn > 0);
  const banker = playerById(db, game.bankerId);
  const bankerName = banker?.name ?? 'The banker';

  const valueOf = (playerId: string, saved: Cents | null) => drafts[playerId] ?? moneyInputValue(saved);
  const chipsOf = (playerId: string, saved: Cents | null) => parseMoney(valueOf(playerId, saved));

  const counted = seats.map((s) => ({ seat: s, chips: chipsOf(s.playerId, s.chipCents) }));
  const missing = counted.filter((c) => c.chips == null).length;
  const chipsTotal = counted.reduce((t, c) => t + (c.chips ?? 0), 0);

  const result =
    missing === 0 && game.bankerId
      ? settle(
          counted.map((c) => ({ id: c.seat.playerId, boughtIn: c.seat.totalIn, chips: c.chips ?? 0 })),
          game.bankerId,
          { minCents: db.settings.toleranceMinCents, pct: db.settings.tolerancePct },
        )
      : null;
  // Only preview adjustments when settling is reasonable; a big gap means recount first.
  const adjustmentOf = (playerId: string) =>
    result?.withinTolerance ? (result.rows.find((r) => r.id === playerId)?.adjustment ?? 0) : 0;
  const totalWinnings = counted.reduce((t, c) => t + Math.max(0, (c.chips ?? 0) - c.seat.totalIn), 0);

  const save = (playerId: string, value: string) => {
    const cents = parseMoney(value);
    act((a) => a.setChips(game.id, playerId, cents)).then(() =>
      setDrafts((d) => {
        const rest = { ...d };
        delete rest[playerId];
        return rest;
      }),
    );
  };

  const nextField = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[data-chips]')];
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) next.focus();
    else e.currentTarget.blur();
  };

  const doSettle = () => {
    if (!result) return;
    act((a) =>
      a.settleGame(game.id, {
        potCents: result.pot,
        seats: result.rows.map((r) => ({ playerId: r.id, chipCents: r.chips, cashoutCents: r.cashout })),
        payments: result.payments.map((p) => ({ fromId: p.fromId, toId: p.toId, amountCents: p.amount })),
      }),
    );
  };

  return (
    <>
      <section className="band" aria-label="Total on the table">
        <div className="band-top">
          <span>Cashing out</span>
          {banker && <span>{banker.name} is banking</span>}
        </div>
        <div className="band-pot">
          <strong>{formatMoney(total)}</strong>
          <span>on the table</span>
        </div>
      </section>

      <p className="lead">Count each player's chips and enter what they're worth in dollars.</p>

      <ul className="co">
        {counted.map(({ seat: s, chips }) => {
          const adj = adjustmentOf(s.playerId);
          const net = chips == null ? null : chips + adj - s.totalIn;
          return (
            <li key={s.playerId} className="co-row">
              <div className="co-who">
                <span className="co-name">{s.player.name}</span>
                <span className="muted small">
                  Bought in {formatMoney(s.totalIn)}
                  {net != null && (
                    <>
                      {' · '}
                      <span className={net > 0 ? 'win' : net < 0 ? 'lose' : ''}>
                        {net > 0 ? `up ${formatMoney(net)}` : net < 0 ? `down ${formatMoney(-net)}` : 'even'}
                      </span>
                    </>
                  )}
                </span>
                {adj !== 0 && chips != null && (
                  <span className="co-adj small">
                    {formatMoney(chips)} → {formatMoney(chips + adj)}
                  </span>
                )}
              </div>
              <div className="co-inputs">
                <MoneyInput
                  className="co-money"
                  data-chips
                  value={valueOf(s.playerId, s.chipCents)}
                  onChange={(v) => setDrafts((d) => ({ ...d, [s.playerId]: v }))}
                  onBlur={(e) => drafts[s.playerId] !== undefined && save(s.playerId, e.target.value)}
                  onKeyDown={nextField}
                  enterKeyHint="next"
                  aria-label={`${s.player.name}'s chips`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="foot">
        <div className={'check' + (result ? (result.withinTolerance ? (result.diff === 0 ? ' ok' : ' warn') : ' bad') : '')} role="status">
          <div className="check-line">
            <span>Chips counted</span>
            <strong>
              {formatMoney(chipsTotal)} <span className="muted">of {formatMoney(total)}</span>
            </strong>
          </div>
          <p>
            {!result
              ? missing > 0
                ? `${missing} ${missing === 1 ? 'player' : 'players'} left to count.`
                : 'Pick a banker on the table screen first.'
              : result.diff === 0
                ? '✓ Chips match the total buy-ins exactly.'
                : result.withinTolerance
                  ? describeAdjustment(result.diff, totalWinnings, bankerName)
                  : `That's ${formatMoney(Math.abs(result.diff))} ${result.diff > 0 ? 'more' : 'less'} than the total buy-ins. That's a big gap, so it's worth a recount.`}
          </p>
        </div>

        <div className="row2">
          <button className="secondary" onClick={() => act((a) => a.setStatus(game.id, 'live'))}>
            Back to table
          </button>
          {result && !result.withinTolerance ? (
            <button className="secondary warn-outline" onClick={doSettle}>
              Settle anyway
            </button>
          ) : (
            <button className="primary" disabled={!result} onClick={doSettle}>
              Settle up
            </button>
          )}
        </div>
      </div>
    </>
  );
}
