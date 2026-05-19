import type { ReactNode } from 'react';

export type View = 'review' | 'library' | 'tray' | 'settings';

interface SidebarProps {
  view: View;
  onView: (v: View) => void;
  trayCount: number;
}

interface NavBtn {
  key: View;
  title: string;
  icon: ReactNode;
  badge?: number;
}

const ico = {
  review: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-current fill-none stroke-[1.4]">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-current fill-none stroke-[1.4]">
      <rect x="3" y="4" width="6" height="7" />
      <rect x="3" y="13" width="6" height="7" />
      <rect x="11" y="4" width="10" height="7" />
      <rect x="11" y="13" width="10" height="7" />
    </svg>
  ),
  tray: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-current fill-none stroke-[1.4]">
      <path d="M3 4h18v6H3zM3 14h18v6H3z" />
      <path d="M7 7h2M7 17h2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-current fill-none stroke-[1.4]" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.13.42.55.74 1 .74H21a2 2 0 0 1 0 4h-.09c-.7 0-1.31.4-1.51 1z" />
    </svg>
  ),
};

export function Sidebar({ view, onView, trayCount }: SidebarProps) {
  const items: NavBtn[] = [
    { key: 'review', title: 'Review', icon: ico.review },
    { key: 'library', title: 'Library', icon: ico.library },
    { key: 'tray', title: 'Tray', icon: ico.tray, badge: trayCount },
    { key: 'settings', title: 'Settings', icon: ico.settings },
  ];
  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-[72px] border-r border-border flex-col items-center py-9 gap-1.5 bg-bg">
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            title={it.title}
            onClick={() => onView(it.key)}
            className={`relative w-11 h-11 grid place-items-center border transition-colors ${
              active
                ? 'text-text border-text'
                : 'text-muted border-transparent hover:text-text hover:border-border'
            }`}
          >
            {it.icon}
            {it.badge !== undefined && it.badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[9.5px] grid place-items-center bg-text text-bg font-medium tracking-[0.12em]">
                {it.badge}
              </span>
            )}
          </button>
        );
      })}
      <div className="mt-auto text-[9px] tracking-[0.2em] text-muted [writing-mode:vertical-rl] rotate-180 pb-2">
        v0.1 · dev
      </div>
    </aside>
  );
}
