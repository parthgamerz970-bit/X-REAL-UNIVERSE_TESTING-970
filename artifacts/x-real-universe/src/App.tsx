import { useCallback, useEffect, useRef, useState } from 'react';

type BrowserAudioContext = typeof AudioContext & {
  new (): AudioContext;
};

type Settings = {
  soundEffects: boolean;
  music: boolean;
  uiSounds: boolean;
  fullscreen: boolean;
};

const SETTINGS_STORAGE_KEY = 'exovanta-settings';
const DEFAULT_SETTINGS: Settings = {
  soundEffects: true,
  music: true,
  uiSounds: true,
  fullscreen: false,
};

function readSettings(): Settings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(stored) as Partial<Settings>;
    return {
      soundEffects: parsed.soundEffects ?? DEFAULT_SETTINGS.soundEffects,
      music: parsed.music ?? DEFAULT_SETTINGS.music,
      uiSounds: parsed.uiSounds ?? DEFAULT_SETTINGS.uiSounds,
      fullscreen: parsed.fullscreen ?? DEFAULT_SETTINGS.fullscreen,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function UniverseMenu() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => readSettings());
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Local persistence can be unavailable in private browsing contexts.
    }
  }, [settings]);

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
    if (!settings.uiSounds) return;

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
  }, [getAudioContext, settings.uiSounds]);

  const playClickSound = useCallback(() => {
    if (!settings.soundEffects) return;

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
  }, [getAudioContext, settings.soundEffects]);

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

  const toggleSetting = (setting: keyof Settings) => {
    setSettings((current) => ({ ...current, [setting]: !current[setting] }));
  };

  const handleFullscreenToggle = async () => {
    const shouldEnterFullscreen = !settings.fullscreen;
    setSettings((current) => ({ ...current, fullscreen: shouldEnterFullscreen }));

    try {
      if (shouldEnterFullscreen) {
        await document.documentElement.requestFullscreen?.();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      setSettings((current) => ({ ...current, fullscreen: Boolean(document.fullscreenElement) }));
    }
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
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
          <div className="settings-heading">
            <strong>SETTINGS</strong>
            <span>LOCAL PREFERENCES</span>
          </div>
          <div className="settings-options">
            <button
              className={`setting-row${settings.soundEffects ? ' is-on' : ' is-off'}`}
              type="button"
              role="switch"
              aria-checked={settings.soundEffects}
              onClick={() => toggleSetting('soundEffects')}
              onPointerEnter={playHoverSound}
            >
              <span className="setting-label">🔊 Sound Effects</span>
              <span className="toggle" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
              <span className="setting-state">{settings.soundEffects ? 'ON' : 'OFF'}</span>
            </button>
            <button
              className={`setting-row${settings.music ? ' is-on' : ' is-off'}`}
              type="button"
              role="switch"
              aria-checked={settings.music}
              onClick={() => toggleSetting('music')}
              onPointerEnter={playHoverSound}
            >
              <span className="setting-label">🎵 Music</span>
              <span className="toggle" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
              <span className="setting-state">{settings.music ? 'ON' : 'OFF'}</span>
            </button>
            <button
              className={`setting-row${settings.uiSounds ? ' is-on' : ' is-off'}`}
              type="button"
              role="switch"
              aria-checked={settings.uiSounds}
              onClick={() => toggleSetting('uiSounds')}
              onPointerEnter={playHoverSound}
            >
              <span className="setting-label">🔔 UI Sounds</span>
              <span className="toggle" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
              <span className="setting-state">{settings.uiSounds ? 'ON' : 'OFF'}</span>
            </button>
            <button
              className={`setting-row${settings.fullscreen ? ' is-on' : ' is-off'}`}
              type="button"
              role="switch"
              aria-checked={settings.fullscreen}
              onClick={handleFullscreenToggle}
              onPointerEnter={playHoverSound}
            >
              <span className="setting-label">🖥️ Fullscreen</span>
              <span className="toggle" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
              <span className="setting-state">{settings.fullscreen ? 'ON' : 'OFF'}</span>
            </button>
          </div>
          <button className="reset-settings" type="button" onClick={resetSettings}>
            <span aria-hidden="true">🔄</span>
            Reset Settings
          </button>
        </div>
      </div>

    </main>
  );
}

function App() {
  return <UniverseMenu />;
}

export default App;
