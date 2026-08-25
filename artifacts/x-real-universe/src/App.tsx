import { useCallback, useEffect, useRef, useState } from 'react';

type BrowserAudioContext = typeof AudioContext & {
  new (): AudioContext;
};

function UniverseMenu() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

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

  useEffect(() => {
    return () => {
      void audioContextRef.current?.close();
    };
  }, []);

  const handleMenuAction = (action: 'play' | 'marketplace' | 'settings') => {
    playClickSound();

    if (action === 'play') {
      return;
    } else if (action === 'marketplace') {
      return;
    } else {
      setSettingsOpen((open) => !open);
    }
  };

  return (
    <main className="universe-menu" aria-label="EXOVANTA main menu">
      <img
        className="galaxy"
        src="/galaxy_1786993509195.jpg"
        alt=""
        aria-hidden="true"
      />

      <section className="title-block" aria-labelledby="game-title">
        <h1 className="title" id="game-title" data-testid="text-game-title">
          EXOVANTA
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
          <img src="/settings-icon.png" alt="" aria-hidden="true" />
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

    </main>
  );
}

function App() {
  return <UniverseMenu />;
}

export default App;
