import { useState } from 'react';
import { useAct, useDb } from '../app/StoreContext';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { copyText } from '../lib/clipboard';
import { setMe, useMe } from '../lib/me';
import { formatMoney } from '../lib/money';
import { paymentsFor, playerById, seatsFor } from '../lib/select';
import { describeAdjustment, summaryText } from '../lib/summary';
import type { Game, Payment } from '../lib/types';

interface Props {
  game: Game;
  /** Leave this screen (shown once everyone has paid). */
  onDone?: () => void;
  /** Go to the start screen while this game still has unpaid payments. */
  onStartNext?: () => void;
  /** Shown when opened from History. */
  onBack?: () => void;
  onHistory?: () => void;
  /** Only the newest game can go back to counting chips. */
  canReopen?: boolean;
}

export function SettleUpScreen({ game, onDone, onStartNext, onBack, onHistory, canReopen = true }: Props) {
  const db = useDb();
  const act = useAct();
  const toast = useToast();
  const me = useMe();
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [editingContact, setEditingContact] = useState(false);

  const banker = playerById(db, game.bankerId);
  const bankerName = banker?.name ?? 'The banker';
  const nameOf = (id: string) => playerById(db, id)?.name ?? 'Player';
  const payments = paymentsFor(db, game.id);
  const paidCount = payments.filter((p) => p.paidAt).length;
  const allPaid = paidCount === payments.length;
  const collect = payments.filter((p) => p.toId === game.bankerId).reduce((t, p) => t + p.amountCents, 0);
  const payOut = payments.filter((p) => p.fromId === game.bankerId).reduce((t, p) => t + p.amountCents, 0);

  const rows = seatsFor(db, game.id)
    .filter((s) => s.totalIn > 0)
    .map((s) => {
      const chips = s.chipCents ?? 0;
      const cashout = s.cashoutCents ?? chips;
      return { id: s.playerId, name: s.player.name, totalIn: s.totalIn, chips, cashout, net: cashout - s.totalIn };
    })
    .sort((a, b) => b.net - a.net);
  const total = game.potCents ?? rows.reduce((t, r) => t + r.totalIn, 0);
  const diff = rows.reduce((t, r) => t + r.chips, 0) - total;
  const winnings = rows.reduce((t, r) => t + Math.max(0, r.chips - r.totalIn), 0);
  const note = describeAdjustment(diff, winnings, bankerName);
  const dateLabel = new Date(game.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // Who can tick boxes: each sender for their own payment, and the banker for any payment.
  const players = seatsFor(db, game.id).filter((x) => x.totalIn > 0).map((x) => x.player);
  const myName = me && players.some((x) => x.id === me) ? nameOf(me) : null;
  const iSend = payments.filter((p) => p.fromId === me && !p.paidAt).length > 0;
  const iAmBanker = !!me && me === game.bankerId;
  const canTick = (p: Payment) => iAmBanker || p.fromId === me;

  const togglePaid = async (p: Payment) => {
    if (!canTick(p)) {
      toast(
        p.fromId === game.bankerId
          ? `Only ${bankerName} (the banker) can tick this off.`
          : `Only ${nameOf(p.fromId)} or ${bankerName} (the banker) can tick this off.`,
      );
      return;
    }
    const paid = !p.paidAt;
    await act((a) => a.setPaid(p.id, paid));
    if (paid && paidCount + 1 === payments.length) toast("That's everyone. All paid up!");
  };

  const copy = async (text: string, what: string) => {
    toast((await copyText(text)) ? `Copied ${what}` : "Couldn't copy. Press and hold to copy instead.");
  };

  const copySummary = () =>
    copy(
      summaryText({
        dateLabel,
        totalCents: total,
        bankerName,
        bankerContact: banker?.etransferContact ?? null,
        results: rows.map((r) => ({ name: r.name, net: r.net })),
        payments: payments.map((p) => ({ from: nameOf(p.fromId), to: nameOf(p.toId), amount: p.amountCents })),
        note,
      }),
      'the summary. Paste it in the group chat.',
    );

  return (
    <>
      {onBack && (
        <button className="textlink back" onClick={onBack}>
          ← Past games
        </button>
      )}
      <section className="band" aria-label="Total on the table">
        <div className="band-top">
          <span>{dateLabel} · settle up</span>
          <span>{allPaid ? 'All paid' : `${paidCount} of ${payments.length} paid`}</span>
        </div>
        <div className="band-pot">
          <strong>{formatMoney(total)}</strong>
          <span>on the table</span>
        </div>
      </section>

      {/* Where to send money */}
      <section className="card banker-card" aria-label="Banker">
        <p className="muted small">Send e-Transfers to</p>
        <p className="banker-name">{bankerName}</p>
        {banker && editingContact ? (
          <ContactForm
            initial={banker.etransferContact ?? ''}
            onSave={(v) => {
              act((a) => a.setContact(banker.id, v));
              setEditingContact(false);
            }}
          />
        ) : banker?.etransferContact ? (
          <div className="contact-row">
            <span className="contact">{banker.etransferContact}</span>
            <button className="mini" onClick={() => copy(banker.etransferContact!, banker.etransferContact!)}>
              Copy
            </button>
            <button className="mini ghost" onClick={() => setEditingContact(true)}>
              Change
            </button>
          </div>
        ) : banker ? (
          <button className="secondary" onClick={() => setEditingContact(true)}>
            Add {bankerName}'s e-Transfer email or phone
          </button>
        ) : null}
        {payments.length > 0 && (
          <p className="banker-sum">
            {bankerName} collects <strong>{formatMoney(collect)}</strong> and pays out <strong>{formatMoney(payOut)}</strong>.
          </p>
        )}
      </section>

      {note && <p className="notice">{note}</p>}

      {/* Payments */}
      <section className="block" aria-label="Payments">
        <h2>Who sends what</h2>
        {payments.length === 0 ? (
          <p className="muted">Everyone broke even. Nobody owes anything.</p>
        ) : (
          <>
          {!allPaid &&
            (myName ? (
              <p className="me-bar">
                You're <strong>{myName}</strong>.{' '}
                {iAmBanker
                  ? 'As the banker, you can tick off any payment.'
                  : iSend
                    ? "Tick off what you send once it's sent."
                    : "You don't need to send anything."}{' '}
                <button className="inline-link" onClick={() => setMe(null)}>
                  Not {myName}?
                </button>
              </p>
            ) : (
              <div className="me-pick">
                <p>Which one are you? Tap your name to tick off what you send.</p>
                <div className="quick">
                  {players.map((x) => (
                    <button key={x.id} className="quick-btn" onClick={() => setMe(x.id)}>
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          <ul className="pays">
            {payments.map((p) => (
              <li key={p.id} className={'pay' + (p.paidAt ? ' is-paid' : '') + (canTick(p) ? ' is-mine' : '')}>
                <button
                  className="pay-check"
                  role="checkbox"
                  aria-checked={!!p.paidAt}
                  aria-disabled={!canTick(p)}
                  onClick={() => togglePaid(p)}
                >
                  <span className="box" aria-hidden="true">
                    {p.paidAt ? '✓' : ''}
                  </span>
                  <span className="pay-text">
                    {nameOf(p.fromId)} sends {nameOf(p.toId)}
                  </span>
                  <strong className="pay-amt">{formatMoney(p.amountCents)}</strong>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </section>

      {/* Results */}
      <section className="block" aria-label="Results">
        <h2>Results</h2>
        <ul className="results">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <span className="res-name">{r.name}</span>
                <span className="muted small">
                  In {formatMoney(r.totalIn)} · out{' '}
                  {r.cashout !== r.chips ? (
                    <>
                      <s>{formatMoney(r.chips)}</s> {formatMoney(r.cashout)}
                    </>
                  ) : (
                    formatMoney(r.cashout)
                  )}
                </span>
              </div>
              <strong className={r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'muted'}>
                {r.net === 0 ? 'even' : formatMoney(r.net, { signed: true })}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      <div className="btnstack">
        <button className="primary" onClick={copySummary}>
          Copy summary for the group chat
        </button>
        {allPaid && onDone && (
          <button className="secondary" onClick={onDone}>
            Done
          </button>
        )}
        {!allPaid && onStartNext && (
          <button className="secondary" onClick={onStartNext}>
            Start next game
          </button>
        )}
        {canReopen && (
          <button className="textlink" onClick={() => (paidCount ? setConfirmReopen(true) : act((a) => a.reopenGame(game.id)))}>
            Fix chip counts
          </button>
        )}
        {onHistory && (
          <button className="textlink" onClick={onHistory}>
            Past games
          </button>
        )}
      </div>

      {confirmReopen && (
        <Sheet title="Fix chip counts?" onClose={() => setConfirmReopen(false)}>
          <p className="muted">
            This goes back to counting chips. The {paidCount} {paidCount === 1 ? 'payment' : 'payments'} already ticked off will be
            cleared, and you'll need to tick them again after settling.
          </p>
          <button
            className="primary danger-fill"
            onClick={() => {
              setConfirmReopen(false);
              act((a) => a.reopenGame(game.id));
            }}
          >
            Go back to counting
          </button>
          <button className="secondary" onClick={() => setConfirmReopen(false)}>
            Cancel
          </button>
        </Sheet>
      )}
    </>
  );
}

function ContactForm({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <input
        className="field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Email or phone number"
        aria-label="e-Transfer email or phone"
        inputMode="email"
        autoComplete="off"
        autoFocus
        maxLength={100}
      />
      <button className="secondary" type="submit">
        Save
      </button>
    </form>
  );
}
