import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { pendingCount } from './api/outbox';
import { forgetProfileData, useOutboxSync } from './api/queries';
import { pastel } from './lib/color';
import { HabitEdit } from './pages/HabitEdit';
import { PairDevice } from './pages/PairDevice';
import { ProfilePicker } from './pages/ProfilePicker';
import { Settings } from './pages/Settings';
import { Stats } from './pages/Stats';
import { StatsDetail } from './pages/StatsDetail';
import { Today } from './pages/Today';
import { Unlock } from './pages/Unlock';
import { lock, paired, session, switchProfile } from './session';
import { Wordmark } from './ui';

export function App() {
  const { profile, locked } = session.use();
  if (!paired.use()) return <PairDevice />;
  if (!profile) return <ProfilePicker />;
  if (locked) return <Unlock profile={profile} onBack={() => switchProfile().then(forgetProfileData)} />;
  return <Shell />;
}

const tabs = [
  { to: '/', label: 'Tracker', icon: 'M4 5h16v14H4zM4 10h16M9 5v14' },
  { to: '/stats', label: 'Stats', icon: 'M5 20V10m7 10V4m7 16v-7' },
  { to: '/settings', label: 'Settings', icon: 'M4 7h16M4 12h16M4 17h16' },
];

// One width for the bar and for every page under it.
const FRAME = 'mx-auto w-full max-w-[85rem] px-4 lg:px-8';

function Shell() {
  useOutboxSync();
  const pending = pendingCount.use();
  const profile = session.use().profile!;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className={`${FRAME} grid h-14 grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]`}>
          <Wordmark />
          <nav className="hidden rounded-full bg-line/60 p-1 lg:flex" aria-label="Main">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex h-8 items-center rounded-full px-5 text-sm font-medium transition-colors ${isActive ? 'bg-sheet text-ink shadow-sm' : 'text-muted hover:text-ink'}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-2">
            {pending > 0 && (
              <span className="flex h-8 items-center gap-2 rounded-full border border-line px-3 text-xs text-muted" role="status" title="Saved on this device, waiting for the server">
                <span className="size-1.5 rounded-full bg-accent" />
                {pending}
                <span className="hidden sm:inline">waiting to sync</span>
              </span>
            )}
            <span className="flex h-10 items-center gap-2 text-sm" title="Current profile">
              <span className="flex size-7 items-center justify-center rounded-md border border-line" style={{ background: pastel(profile.color) }}>
                {profile.emoji}
              </span>
              <span className="hidden max-w-40 truncate sm:block">{profile.name}</span>
            </span>
            <button type="button" className="btn btn-icon" onClick={lock} aria-label="Lock" title="Lock">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 017 0V11" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className={`${FRAME} py-5 pb-24 lg:py-8 lg:pb-12`}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/habit/new" element={<HabitEdit />} />
          <Route path="/habit/:id" element={<HabitEdit />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/stats/:id" element={<StatsDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => `flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-muted'}`}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
