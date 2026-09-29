import { useState } from 'react';
import { useAct, useDb } from '../app/StoreContext';
import { MoneyInput } from '../components/MoneyInput';
import { useToast } from '../components/Toast';
import { setMe, useMe } from '../lib/me';
import { formatMoney, moneyInputValue, parseMoney } from '../lib/money';
import { playerById } from '../lib/select';
import { toleranceFor } from '../lib/settle';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const db = useDb();
  const act = useAct();
  const toast = useToast();
  const me = playerById(db, useMe());
  const s = db.settings;

  const [minValue, setMinValue] = useState(moneyInputValue(s.toleranceMinCents));
  const [pctValue, setPctValue] = useState(String(s.tolerancePct));
  const [presets, setPresets] = useState(s.presetCents);
  const [newPreset, setNewPreset] = useState('');

  const minCents = parseMoney(minValue);
  const pct = Number(pctValue);
  const valid = minCents != null && pctValue.trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 50 && presets.length > 0;
  const changed =
    minCents !== s.toleranceMinCents || pct !== s.tolerancePct || presets.join() !== s.presetCents.join();

  const addPreset = () => {
    const c = parseMoney(newPreset);
    if (!c) return;
    if (presets.length >= 6) return toast('Up to six amounts.');
    setPresets([...new Set([...presets, c])].sort((a, b) => a - b));
    setNewPreset('');
  };

  const save = async () => {
    if (!valid || minCents == null) return;
    await act((a) => a.setSettings({ toleranceMinCents: minCents, tolerancePct: pct, presetCents: presets }));
    toast('Settings saved for everyone.');
    onBack();
  };

  return (
    <>
      <button className="textlink back" onClick={onBack}>
        ← Back
      </button>
      <header className="page-head">
        <h1>Settings</h1>
        <p className="muted">These apply to everyone in the group.</p>
      </header>

      <section className="card settings">
        <h2>Rebuy amounts</h2>
        <p className="muted small">The quick buttons when someone taps Rebuy.</p>
        <div className="quick">
          {presets.map((c) => (
            <button
              key={c}
              className="quick-btn preset"
              onClick={() => (presets.length > 1 ? setPresets(presets.filter((x) => x !== c)) : toast('Keep at least one amount.'))}
              aria-label={`Remove ${formatMoney(c)}`}
            >
              {formatMoney(c)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            addPreset();
          }}
        >
          <MoneyInput className="wide" value={newPreset} onChange={setNewPreset} placeholder="Add an amount" aria-label="Add an amount" />
          <button className="secondary" type="submit" disabled={!parseMoney(newPreset)}>
            Add
          </button>
        </form>
      </section>

      <section className="card settings">
        <h2>Recount warning</h2>
        <p className="muted small">
          When the chip count doesn't match the buy-ins, a small difference is fixed automatically. A bigger one gets a
          "worth a recount" warning (you can always settle anyway). Warn when it's off by more than:
        </p>
        <label className="setting-row">
          <span>This many dollars</span>
          <MoneyInput value={minValue} onChange={setMinValue} aria-label="Dollars" />
        </label>
        <label className="setting-row">
          <span>or this % of the night's buy-ins, if that's more</span>
          <span className="money">
            <input inputMode="decimal" value={pctValue} onChange={(e) => setPctValue(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Percent" />
            <span aria-hidden="true">%</span>
          </span>
        </label>
        {valid && minCents != null && (
          <p className="example small">
            {[20000, 60000]
              .map((night) => `On a ${formatMoney(night)} night, it warns if chips are off by more than ${formatMoney(toleranceFor(night, { minCents, pct }))}.`)
              .join(' ')}
          </p>
        )}
      </section>

      <div className="btnstack">
        <button className="primary" disabled={!valid || !changed} onClick={save}>
          Save
        </button>
      </div>

      <section className="card settings">
        <h2>This phone</h2>
        {me ? (
          <p>
            This phone is <strong>{me.name}</strong>.{' '}
            <button className="inline-link" onClick={() => setMe(null)}>
              Change
            </button>
          </p>
        ) : (
          <p className="muted">You'll be asked who you are when you start or join a game.</p>
        )}
      </section>
    </>
  );
}
