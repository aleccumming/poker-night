import { useState } from 'react';
import { MoneyInput } from '../../components/MoneyInput';
import { Sheet } from '../../components/Sheet';
import { formatMoney, moneyInputValue, parseMoney, type Cents } from '../../lib/money';
import type { Buyin } from '../../lib/types';

interface Props {
  buyin: Buyin;
  playerName: string;
  onSave: (amount: Cents) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Fix a mistake: change a buy-in's amount or remove it. */
export function BuyinSheet({ buyin, playerName, onSave, onDelete, onClose }: Props) {
  const [value, setValue] = useState(moneyInputValue(buyin.amountCents));
  const amount = parseMoney(value);
  const valid = amount != null && amount > 0;
  const time = new Date(buyin.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const save = () => {
    if (!valid) return;
    if (amount !== buyin.amountCents) onSave(amount);
    onClose();
  };

  return (
    <Sheet title={`${playerName}'s ${formatMoney(buyin.amountCents)} buy-in`} onClose={onClose}>
      <p className="muted">Added at {time}. Change the amount or remove it.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <MoneyInput className="wide" value={value} onChange={setValue} aria-label="Buy-in amount" />
      </form>
      <button className="primary" disabled={!valid} onClick={save}>
        Save
      </button>
      <button
        className="secondary danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Remove this buy-in
      </button>
      <button className="textlink" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
