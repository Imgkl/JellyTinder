import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { View } from './components/Sidebar';
import { MobileHeader } from './components/MobileHeader';
import { ReviewView } from './views/ReviewView';
import { LibraryView } from './views/LibraryView';
import { TrayView } from './views/TrayView';
import { SettingsView } from './views/SettingsView';
import { OnboardingView } from './views/onboarding/OnboardingView';
import { Spinner } from './ui';
import { api } from './lib/api';
import type { Settings } from './lib/types';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>('review');
  const [trayCount, setTrayCount] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    api.settings()
      .then((s) => {
        setSettings(s);
        return api.tray().then((items) => setTrayCount(items.length)).catch(() => null);
      })
      .catch((e) => setBootError(String(e)));
  }, []);

  async function refreshTrayCount() {
    try {
      const items = await api.tray();
      setTrayCount(items.length);
    } catch {
      // ignore
    }
  }

  if (bootError) {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="text-center max-w-md">
          <p className="text-[10.5px] uppercase tracking-[0.22em] text-danger mb-3">Boot failed</p>
          <p className="text-text-dim text-sm break-words">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="h-full grid place-items-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (!settings.onboarded) {
    return <OnboardingView settings={settings} onDone={(s) => { setSettings(s); refreshTrayCount(); }} />;
  }

  return (
    <div className="grid lg:grid-cols-[72px_1fr] min-h-full">
      <Sidebar view={view} onView={setView} trayCount={trayCount} />
      <div className="flex flex-col min-w-0">
        <MobileHeader view={view} onView={setView} trayCount={trayCount} />
        <main className="flex-1 min-w-0">
          {view === 'review' && (
            <ReviewView
              settings={settings}
              trayCount={trayCount}
              onTrayChanged={refreshTrayCount}
              onGoTray={() => setView('tray')}
            />
          )}
          {view === 'library' && (
            <LibraryView
              onTrayChanged={refreshTrayCount}
              onGoTray={() => setView('tray')}
            />
          )}
          {view === 'tray' && (
            <TrayView
              onTrayChanged={refreshTrayCount}
              onGoReview={() => setView('review')}
            />
          )}
          {view === 'settings' && (
            <SettingsView settings={settings} onSettings={(s) => setSettings(s)} />
          )}
        </main>
      </div>
    </div>
  );
}
