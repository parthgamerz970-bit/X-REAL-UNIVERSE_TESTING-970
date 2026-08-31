import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Monitor, Music2, RotateCcw, Volume2, X } from 'lucide-react';

import { GameWorld } from '@/components/GameWorld';

type BrowserAudioContext = typeof AudioContext & { new (): AudioContext };

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

type SettingRowProps = {
  label: string;
  icon: typeof Volume2;
  checked: boolean;
  onToggle: () => void;
  testId: string;
  onHover: () => void;
};

function SettingRow({ label, icon: Icon, checked, onToggle, testId, onHover }: SettingRowProps) {
  return (
    <button
      className={`setting-row${checked ? ' is-on' : ' is-off'}`}
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={onToggle}
      onPointerEnter={onHover}
    >
      <span className="setting-label"><Icon size={13} strokeWidth={1.8} /> {label}</span>
      <span className="toggle" aria-hidden="true"><span className="toggle-thumb" /></span>
      <span className="setting-state">{checked ? 'ON' : 'OFF'}</span>
    </button>
  );
}

function UniverseMenu() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => readSettings());
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Local persistence can be unavailable in private browsing contexts.
    }
  }, [settings]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setSettings((current) => (
        current.fullscreen === isFullscreen ? current : { ...current, fullscreen: isFullscreen }
      ));
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const getAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioContextConstructor = (
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext
        ) as BrowserAudioContext | undefined;
        if (!AudioContextConstructor) return null;
        audioContextRef.current = new AudioContextConstructor();
      }
      if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume();
      return audioContextRef.current;
    } catch {
      audioContextRef.current = null;
      return null;
    }
  }, []);

  const playHoverSound = useCallback(() => {
    if (!settings.uiSounds) return;
    const context = getAudioContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(1020, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    oscillator.connect(gain);
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

  useEffect(() => () => { void audioContextRef.current?.close(); }, []);

  const toggleSetting = (setting: keyof Settings) => {
    setSettings((current) => ({ ...current, [setting]: !current[setting] }));
  };

  const handleFullscreenToggle = async () => {
    const shouldEnterFullscreen = !settings.fullscreen;
    try {
      if (shouldEnterFullscreen && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Fullscreen is optional on some embedded browsers; never block the menu.
    }
    setSettings((current) => ({ ...current, fullscreen: Boolean(document.fullscreenElement) }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  if (playing) {
    return <GameWorld onExit={() => { setPlaying(false); setSettingsOpen(false); }} />;
  }

  return (
    <main className="universe-menu" aria-label="EXOVANTA main menu">
      <img className="galaxy" src="./galaxy_1786993509195.jpg" alt="" aria-hidden="true" />
      <section className="title-block" aria-labelledby="game-title">
        <h1 className="title" id="game-title" data-testid="text-game-title">EXOVANTA</h1>
        <p className="tagline" data-testid="text-tagline">A REAL LIFE SIMULATION</p>
      </section>

      <nav className="menu-stack" aria-label="Main menu">
        <button
          className="menu-button primary"
          type="button"
          data-action="play"
          data-testid="button-play"
          onPointerEnter={playHoverSound}
          onFocus={playHoverSound}
          onClick={() => {
            try { playClickSound(); } catch { /* Audio is optional and must not block Play. */ }
            setSettingsOpen(false);
            setPlaying(true);
          }}
        >Play</button>
        <button
          className="menu-button"
          type="button"
          data-action="marketplace"
          data-testid="button-marketplace"
          onPointerEnter={playHoverSound}
          onFocus={playHoverSound}
          onClick={() => { playClickSound(); setMarketplaceOpen(true); }}
        >Marketplace</button>
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
          onClick={() => { playClickSound(); setSettingsOpen((open) => !open); }}
        ><img src="./settings-icon.png" alt="" aria-hidden="true" /></button>
        <div className={`settings-panel${settingsOpen ? ' is-visible' : ''}`} id="settings-panel" role="region" aria-label="Settings" aria-hidden={!settingsOpen} data-testid="panel-settings">
          <div className="settings-heading"><strong>SETTINGS</strong><span>LOCAL PREFERENCES</span></div>
          <div className="settings-options">
            <SettingRow label="Sound Effects" icon={Volume2} checked={settings.soundEffects} onToggle={() => toggleSetting('soundEffects')} testId="setting-sound-effects" onHover={playHoverSound} />
            <SettingRow label="Music" icon={Music2} checked={settings.music} onToggle={() => toggleSetting('music')} testId="setting-music" onHover={playHoverSound} />
            <SettingRow label="UI Sounds" icon={Bell} checked={settings.uiSounds} onToggle={() => toggleSetting('uiSounds')} testId="setting-ui-sounds" onHover={playHoverSound} />
            <SettingRow label="Fullscreen" icon={Monitor} checked={settings.fullscreen} onToggle={() => void handleFullscreenToggle()} testId="setting-fullscreen" onHover={playHoverSound} />
          </div>
          <button className="reset-settings" type="button" data-testid="button-reset-settings" onClick={resetSettings}>
            <RotateCcw size={12} /> Reset Settings
          </button>
        </div>
      </div>

      {marketplaceOpen && (
        <div className="marketplace-overlay" role="dialog" aria-modal="true" aria-label="Marketplace">
          <div className="marketplace-card">
            <div className="marketplace-head">
              <div><p className="marketplace-kicker">OFFLINE CATALOG / 01</p><h2 className="marketplace-title">Marketplace</h2></div>
              <button className="close-button" type="button" data-testid="button-close-marketplace" aria-label="Close marketplace" onClick={() => setMarketplaceOpen(false)}><X size={18} /></button>
            </div>
            <p className="marketplace-copy">The field-test catalog is staged locally for the next expedition build. No connection is required to browse this prototype.</p>
            <div className="marketplace-status">CATALOG STATUS: STANDBY<br />NEXT DROP: HABITAT EQUIPMENT</div>
          </div>
        </div>
      )}
    </main>
  );
}

function App() {
  return <UniverseMenu />;
}

export default App;