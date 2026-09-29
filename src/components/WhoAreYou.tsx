import { useState } from 'react';
import type { Player } from '../lib/types';

interface Props {
  prompt: string;
  /** Names to tap, most likely first. */
  players: Player[];
  onChoose: (player: Player) => void;
  /** Someone whose name isn't in the list yet. */
  onNew: (name: string) => void;
}

/** "Which one are you?": asked once per phone, then remembered. */
export function WhoAreYou({ prompt, players, onChoose, onNew }: Props) {
  const [name, setName] = useState('');
  return (
    <div className="me-pick">
      <p>{prompt}</p>
      {players.length > 0 && (
        <div className="quick">
          {players.slice(0, 20).map((p) => (
            <button key={p.id} className="quick-btn" onClick={() => onChoose(p)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <form
        className="add me-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onNew(name.trim());
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={players.length ? 'New here? Your name' : 'Your name'}
          aria-label="Your name"
          autoComplete="given-name"
          enterKeyHint="done"
          maxLength={40}
        />
        <button type="submit" disabled={!name.trim()}>
          That's me
        </button>
      </form>
    </div>
  );
}
