import { useState } from 'react';
import { MoneyInput } from '../../components/MoneyInput';
import { Sheet } from '../../components/Sheet';
import { formatMoney, parseMoney, type Cents } from '../../lib/money';

interface Props {
  playerName: string;
  presets: Cents[];
  suggested: Cents;
  isFirst: boolean;
  onAdd: (amount: Cents) => void;
  onClose: () => void;
}

/** Tap "Rebuy", then tap the big button: the player's last amount is already picked. */
export function RebuySheet({ playerName, presets, suggested, isFirst, onAdd, onClose }: Props) {
  const options = presets.includes(suggested) ? presets : [...presets, suggested].sort((a, b) => a - b);
  const [picked, setPicked] = useState<Cents | null>(suggested);
  const [custom, setCustom] = useState('');
  const amount = custom ? parseMoney(custom) : picked;
  const valid = amount != null && amount > 0;

  const submit = () => {
    if (!valid) return;
    onAdd(amount);
    onClose();
  };

  return (
    <Sheet title={`${isFirst ? 'Buy-in' : 'Rebuy'} for ${playerName}`} onClose={onClose}>
      <div className="amounts" role="radiogroup" aria-label="Amount">
        {options.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={!custom && picked === c}
            className={'amount' + (!custom && picked === c ? ' is-picked' : '')}
            onClick={() => {
              setPicked(c);
              setCustom('');
            }}
          >
            {formatMoney(c)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <MoneyInput
          className="wide"
          value={custom}
          onChange={setCustom}
          placeholder="Other amount"
          aria-label="Other amount"
        />
      </form>
      <button className="primary big" disabled={!valid} onClick={submit}>
        {valid ? `Add ${formatMoney(amount)}` : 'Pick an amount'}
      </button>
      <button className="secondary" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
