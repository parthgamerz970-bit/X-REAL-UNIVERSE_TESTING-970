import { useCallback, useEffect, useRef, useState } from 'react';

type BrowserAudioContext = typeof AudioContext & {
  new (): AudioContext;
};

function UniverseMenu() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState('SYSTEM READY');
  const [statusActive, setStatusActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const statusTimerRef = useRef<number | undefined>(undefined);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = (
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext
      ) as BrowserAudioContext | undefined;
      if (!AudioContextConstructor) return null;
      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playHoverSound = useCallback(() => {
    const context = getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(1020, now + 0.09);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  }, [getAudioContext]);

  const playClickSound = useCallback(() => {
    const context = getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const subOscillator = context.createOscillator();
    const gain = context.createGain();
    const subGain = context.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    subOscillator.type = 'sine';
    subOscillator.frequency.setValueAtTime(62, now);
    subOscillator.frequency.exponentialRampToValueAtTime(34, now + 0.26);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.31);

    oscillator.connect(gain);
    subOscillator.connect(subGain);
    gain.connect(context.destination);
    subGain.connect(context.destination);
    oscillator.start(now);
    subOscillator.start(now);
    oscillator.stop(now + 0.3);
    subOscillator.stop(now + 0.32);
  }, [getAudioContext]);

  const setTemporaryStatus = useCallback((message: string) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    setStatus(message);
    setStatusActive(true);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus('SYSTEM READY');
      setStatusActive(false);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
      void audioContextRef.current?.close();
    };
  }, []);

  const handleMenuAction = (action: 'play' | 'marketplace' | 'settings') => {
    playClickSound();

    if (action === 'play') {
      setTemporaryStatus('INITIALIZING UNIVERSE');
    } else if (action === 'marketplace') {
      setTemporaryStatus('MARKETPLACE LINK READY');
    } else {
      setSettingsOpen((open) => {
        const nextOpen = !open;
        setTemporaryStatus(nextOpen ? 'SETTINGS OPEN' : 'SETTINGS CLOSED');
        return nextOpen;
      });
    }
  };

  return (
    <main className="universe-menu" aria-label="X Real Universe main menu">
      <img
        className="galaxy"
        src="/galaxy_1786993509195.jpg"
        alt=""
        aria-hidden="true"
      />

      <div className="menu-topline" aria-hidden="true">
        <span className="brand-mark">XRU / 01</span>
        <span className="build-label">OPEN WORLD SIMULATION</span>
      </div>

      <section className="title-block" aria-labelledby="game-title">
        <h1 className="title" id="game-title" data-testid="text-game-title">
          X REAL UNIVERSE
        </h1>
        <p className="tagline" data-testid="text-tagline">
          A REAL LIFE SIMULATION
        </p>
      </section>

      <nav className="menu-stack" aria-label="Main menu">
        <button
          className="menu-button primary"
          type="button"
          data-action="play"
          data-testid="button-play"
          onPointerEnter={playHoverSound}
          onFocus={playHoverSound}
          onClick={() => handleMenuAction('play')}
        >
          Play
        </button>
        <button
          className="menu-button"
          type="button"
          data-action="marketplace"
          data-testid="button-marketplace"
          onPointerEnter={playHoverSound}
          onFocus={playHoverSound}
          onClick={() => handleMenuAction('marketplace')}
        >
          Marketplace
        </button>
      </nav>

      <div className="settings-wrap">
        <button
          className="settings-button"
          type="button"
          aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
          data-action="settings"
          data-testid="button-settings"
          onPointerEnter={playHoverSound}
          onFocus={playHoverSound}
          onClick={() => handleMenuAction('settings')}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
            <path d="m19.4 15 .05.04a1.8 1.8 0 0 1-2.55 2.55l-.04-.05a1.8 1.8 0 0 0-3.07 1.27v.07a1.8 1.8 0 0 1-3.6 0v-.07a1.8 1.8 0 0 0-3.07-1.27l-.04.05a1.8 1.8 0 0 1-2.55-2.55l.05-.04A1.8 1.8 0 0 0 5.31 12a1.8 1.8 0 0 0-1.27-3.07h-.07a1.8 1.8 0 0 1 0-3.6h.07a1.8 1.8 0 0 0 1.27-3.07l-.05-.04a1.8 1.8 0 0 1 2.55-2.55l.04.05A1.8 1.8 0 0 0 10.92 1.27V1.2a1.8 1.8 0 0 1 3.6 0v.07a1.8 1.8 0 0 0 3.07 1.27l.04-.05a1.8 1.8 0 0 1 2.55 2.55l-.05.04A1.8 1.8 0 0 0 19.4 15Z" transform="translate(0 5) scale(.58)" />
          </svg>
        </button>
        <div
          className={`settings-panel${settingsOpen ? ' is-visible' : ''}`}
          id="settings-panel"
          role="region"
          aria-label="Settings"
          aria-hidden={!settingsOpen}
          data-testid="panel-settings"
        >
          <strong>SETTINGS</strong>
          Audio feedback: enabled
          <br />
          Display mode: adaptive landscape
          <br />
          Connection: local simulation
        </div>
      </div>

      <div
        className={`status-line${statusActive ? ' is-active' : ''}`}
        role="status"
        aria-live="polite"
        data-testid="status-system"
      >
        <span className="status-dot" aria-hidden="true" />
        <span data-testid="text-status">{status}</span>
      </div>
      <span className="corner-note" aria-hidden="true">
        SECTOR 00 : HOME
      </span>
      <span className="landscape-note">Landscape view recommended</span>
    </main>
  );
}

function App() {
  return <UniverseMenu />;
}

export default App;
