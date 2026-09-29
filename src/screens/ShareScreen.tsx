import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { copyText } from '../lib/clipboard';

interface Props {
  link: string;
  isDemo: boolean;
  onBack: () => void;
}

/** The group link as a big QR code, so people at the table can scan it from the banker's phone. */
export function ShareScreen({ link, isDemo, onBack }: Props) {
  const toast = useToast();
  const [svg, setSvg] = useState('');

  useEffect(() => {
    // Always dark-on-white, even in dark mode: phone cameras read that best.
    QRCode.toString(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [link]);

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <>
      <button className="textlink back" onClick={onBack}>
        ← Back
      </button>
      <header className="page-head">
        <h1>{isDemo ? 'Share the demo' : 'Invite players'}</h1>
        <p className="muted">
          {isDemo
            ? 'Scan to open this demo on a phone.'
            : 'Scan with a phone camera to open the game. Anyone with this link can see and join your games, so keep it in the group chat.'}
        </p>
      </header>

      <div className="qr" aria-label="QR code for the link" role="img" dangerouslySetInnerHTML={{ __html: svg }} />

      <p className="share-link">{link}</p>
      <div className="btnstack">
        <button
          className="primary"
          onClick={async () => toast((await copyText(link)) ? 'Link copied. Paste it in the group chat.' : "Couldn't copy. Press and hold the link instead.")}
        >
          Copy link
        </button>
        {canShare && (
          <button
            className="secondary"
            onClick={() => navigator.share({ title: 'Poker night', text: 'Poker night: tap to join', url: link }).catch(() => undefined)}
          >
            Share…
          </button>
        )}
      </div>
    </>
  );
}
