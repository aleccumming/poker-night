import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import type { SeatView } from '../../lib/select';

interface Props {
  seat: SeatView;
  isBanker: boolean;
  onMakeBanker: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function PlayerSheet({ seat, isBanker, onMakeBanker, onRename, onRemove, onClose }: Props) {
  const name = seat.player.name;
  const [newName, setNewName] = useState(name);
  const [renaming, setRenaming] = useState(false);
  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <Sheet title={name} onClose={onClose}>
      {isBanker ? (
        <p className="muted">{name} is the banker tonight. All money goes through them.</p>
      ) : (
        <button className="primary" onClick={done(onMakeBanker)}>
          Make {name} the banker
        </button>
      )}

      {renaming ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim() && newName.trim() !== name) onRename(newName);
            onClose();
          }}
        >
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Name"
            autoFocus
            maxLength={40}
          />
          <button className="secondary" type="submit">
            Save
          </button>
        </form>
      ) : (
        <button className="secondary" onClick={() => setRenaming(true)}>
          Fix spelling of name
        </button>
      )}

      {seat.buyins.length ? (
        <p className="muted small">To take {name} off the table, remove their buy-ins first.</p>
      ) : (
        <button className="secondary danger" onClick={done(onRemove)}>
          Take {name} off the table
        </button>
      )}
      <button className="textlink" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
