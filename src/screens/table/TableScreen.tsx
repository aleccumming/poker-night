import { useState } from 'react';
import { useAct, useDb } from '../../app/StoreContext';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { WhoAreYou } from '../../components/WhoAreYou';
import { setMe, useMe } from '../../lib/me';
import { formatMoney } from '../../lib/money';
import { playerById, potFor, quickAddPlayers, seatsFor, suggestedAmount, type SeatView } from '../../lib/select';
import type { Buyin, Game } from '../../lib/types';
import { BuyinSheet } from './BuyinSheet';
import { PlayerSheet } from './PlayerSheet';
import { RebuySheet } from './RebuySheet';

type Open = { kind: 'rebuy'; playerId: string } | { kind: 'buyin'; buyinId: string } | { kind: 'player'; playerId: string } | { kind: 'cancel' } | null;

export function TableScreen({ game }: { game: Game }) {
  const db = useDb();
  const act = useAct();
  const toast = useToast();
  const me = playerById(db, useMe());
  const [open, setOpen] = useState<Open>(null);
  const [addingOther, setAddingOther] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const seats = seatsFor(db, game.id);
  const pot = potFor(db, game.id);
  const banker = playerById(db, game.bankerId);
  const hasBuyins = pot > 0;
  const notSeated = quickAddPlayers(db, game.id);
  const close = () => setOpen(null);
  const nameOf = (playerId: string) => playerById(db, playerId)?.name ?? 'Player';
  const meSeated = !!me && seats.some((s) => s.playerId === me.id);
  const iAmBanker = !!me && me.id === game.bankerId;
  /** You manage your own buy-ins; the banker can manage anyone's. */
  const canBuyFor = (playerId: string) => !!me && (me.id === playerId || iAmBanker);

  const addBuyin = async (playerId: string, amount: number) => {
    const b = await act((a) => a.addBuyin(game.id, playerId, amount));
    if (!b) return;
    setJustAdded(b.id);
    toast(`${nameOf(playerId)} +${formatMoney(amount)}`, { undo: () => act((a) => a.deleteBuyin(b.id)) });
  };

  const deleteBuyin = async (b: Buyin) => {
    await act((a) => a.deleteBuyin(b.id));
    toast(`Removed ${nameOf(b.playerId)}'s ${formatMoney(b.amountCents)} buy-in`, { undo: () => act((a) => a.restoreBuyin(b)) });
  };

  const join = async (name: string) => {
    const id = await act((a) => a.seatPlayer(game.id, name));
    if (id) setMe(id);
  };

  const seatOther = async (name: string) => {
    if (!name.trim()) return;
    await act((a) => a.seatPlayer(game.id, name));
  };

  const unseat = async (s: SeatView) => {
    const wasBanker = game.bankerId === s.playerId;
    await act((a) => a.unseatPlayer(game.id, s.playerId));
    toast(`${s.player.name} left the table`, {
      undo: () =>
        act(async (a) => {
          await a.seatPlayer(game.id, s.player.name);
          if (wasBanker) await a.setBanker(game.id, s.playerId);
        }),
    });
  };

  const dateLabel = new Date(game.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const openBuyin = open?.kind === 'buyin' ? db.buyins.find((b) => b.id === open.buyinId) : undefined;
  const openSeat = open?.kind === 'player' || open?.kind === 'rebuy' ? seats.find((s) => s.playerId === open.playerId) : undefined;
  const notMe = me && (
    <button className="inline-link" onClick={() => setMe(null)}>
      Not {me.name}?
    </button>
  );

  return (
    <>
      <section className="band" aria-label="Total on the table">
        <div className="band-top">
          <span>
            {dateLabel} · {seats.length} {seats.length === 1 ? 'player' : 'players'}
          </span>
          {banker && <span>{banker.name} is banking</span>}
        </div>
        <div className="band-pot">
          <strong>{formatMoney(pot)}</strong>
          <span>on the table</span>
        </div>
      </section>

      {/* Who's holding this phone, and joining the game */}
      {!me ? (
        <WhoAreYou
          prompt="Which one are you? Tap your name, or type it to join."
          players={[...seats.map((s) => s.player), ...notSeated]}
          onChoose={(p) => setMe(p.id)}
          onNew={join}
        />
      ) : !meSeated ? (
        <div className="me-pick">
          <button className="primary big" onClick={() => join(me.name)}>
            Join tonight's game
          </button>
          <p className="muted small center">
            You're {me.name}. {notMe}
          </p>
        </div>
      ) : (
        <p className="me-bar">
          You're <strong>{me.name}</strong>
          {iAmBanker ? ", the banker. You can add anyone's rebuys." : '. Tap Rebuy on your row when you buy in.'} {notMe}
        </p>
      )}

      <ul className="players">
        {seats.map((s) => (
          <li className={'player' + (s.playerId === me?.id ? ' is-me' : '')} key={s.playerId}>
            <div className="player-head">
              <button className="pname" onClick={() => setOpen({ kind: 'player', playerId: s.playerId })}>
                {s.player.name}
              </button>
              {game.bankerId === s.playerId && <span className="badge">Banker</span>}
            </div>
            <div className="player-total">
              <strong>{formatMoney(s.totalIn)}</strong> in
            </div>
            <div className="pills">
              {s.buyins.length === 0 && <span className="muted small">No buy-ins yet</span>}
              {s.buyins.map((b) => (
                <button
                  key={b.id}
                  className={'pill' + (b.id === justAdded ? ' is-new' : '')}
                  disabled={!canBuyFor(s.playerId)}
                  onClick={() => setOpen({ kind: 'buyin', buyinId: b.id })}
                  aria-label={`${formatMoney(b.amountCents)} buy-in. Tap to change or remove.`}
                >
                  {formatMoney(b.amountCents)}
                </button>
              ))}
            </div>
            {canBuyFor(s.playerId) && (
              <button className="rebuy" onClick={() => setOpen({ kind: 'rebuy', playerId: s.playerId })}>
                {s.buyins.length ? 'Rebuy' : 'Buy in'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {hasBuyins && <p className="hint">Tap your amounts to fix a mistake. Tap a name to change the banker.</p>}

      {/* For someone who isn't on their phone */}
      {!addingOther ? (
        <button className="textlink" onClick={() => setAddingOther(true)}>
          Add someone who isn't on their phone
        </button>
      ) : (
        <section className="add-players" aria-label="Add someone else">
          <form
            className="add"
            onSubmit={(e) => {
              e.preventDefault();
              seatOther(otherName);
              setOtherName('');
            }}
          >
            <input
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              placeholder="Their name"
              aria-label="Their name"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={40}
              autoFocus
            />
            <button type="submit" disabled={!otherName.trim()}>
              Add
            </button>
          </form>
          {notSeated.length > 0 && (
            <div className="quick">
              {notSeated.slice(0, 16).map((p) => (
                <button key={p.id} className="quick-btn" onClick={() => seatOther(p.name)}>
                  + {p.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="foot">
        <button className="primary big" disabled={!hasBuyins} onClick={() => act((a) => a.setStatus(game.id, 'cashout'))}>
          Cash out
        </button>
        {!hasBuyins && (
          <button className="textlink" onClick={() => setOpen({ kind: 'cancel' })}>
            Cancel this game
          </button>
        )}
      </div>

      {open?.kind === 'rebuy' && openSeat && (
        <RebuySheet
          playerName={openSeat.player.name}
          presets={db.settings.presetCents}
          suggested={suggestedAmount(db, game.id, openSeat.playerId)}
          isFirst={openSeat.buyins.length === 0}
          onAdd={(amt) => addBuyin(openSeat.playerId, amt)}
          onClose={close}
        />
      )}
      {open?.kind === 'buyin' && openBuyin && (
        <BuyinSheet
          buyin={openBuyin}
          playerName={nameOf(openBuyin.playerId)}
          onSave={(amt) => act((a) => a.updateBuyin(openBuyin.id, amt))}
          onDelete={() => deleteBuyin(openBuyin)}
          onClose={close}
        />
      )}
      {open?.kind === 'player' && openSeat && (
        <PlayerSheet
          seat={openSeat}
          isBanker={game.bankerId === openSeat.playerId}
          onMakeBanker={() => act((a) => a.setBanker(game.id, openSeat.playerId))}
          onRename={(n) => act((a) => a.renamePlayer(openSeat.playerId, n))}
          onRemove={() => unseat(openSeat)}
          onClose={close}
        />
      )}
      {open?.kind === 'cancel' && <CancelSheet onConfirm={() => act((a) => a.cancelGame(game.id))} onClose={close} />}
    </>
  );
}

function CancelSheet({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title="Cancel tonight's game?" onClose={onClose}>
      <p className="muted">No buy-ins have been added yet, so nothing will be lost.</p>
      <button
        className="primary danger-fill"
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        Cancel game
      </button>
      <button className="secondary" onClick={onClose}>
        Keep playing
      </button>
    </Sheet>
  );
}
