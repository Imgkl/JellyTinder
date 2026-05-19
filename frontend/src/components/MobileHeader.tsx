import type { View } from './Sidebar';

interface MobileHeaderProps {
  view: View;
  onView: (v: View) => void;
  trayCount: number;
}

const tabs: { key: View; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'library', label: 'Library' },
  { key: 'tray', label: 'Tray' },
  { key: 'settings', label: 'Settings' },
];

export function MobileHeader({ view, onView, trayCount }: MobileHeaderProps) {
  return (
    <header className="lg:hidden flex items-center justify-between px-4 py-3.5 border-b border-border sticky top-0 bg-bg z-10">
      <div className="font-serif italic text-[20px] leading-none">JellyTinder</div>
      <nav className="flex gap-3.5">
        {tabs.map((t) => {
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onView(t.key)}
              className={`text-[10px] uppercase tracking-[0.2em] relative ${
                active ? 'text-text' : 'text-muted'
              }`}
            >
              {t.label}
              {t.key === 'tray' && trayCount > 0 && (
                <span className="ml-1.5 text-[9.5px] bg-text text-bg px-1.5 py-0.5">{trayCount}</span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
