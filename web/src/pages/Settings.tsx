import type { ExportFile, Profile } from '@non-zero/shared';
import { today } from '@non-zero/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { queryClient, useHabits } from '../api/queries';
import { LookPicker } from '../components/LookPicker';
import { disablePush, enablePush, needsInstallForPush, pushEnabled, pushSupported, testPush } from '../lib/push';
import { useMedia } from '../lib/useMedia';
import { lock, profileRemoved, session, switchProfile, unpairDevice, updateProfile } from '../session';
import { FormRow, Page, Sheet } from '../ui';
import { PROFILE_EMOJIS } from './ProfilePicker';

/** Runs an action and reports how it went in a line of text. */
function useAction() {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ ok: true, text: await action() });
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  const message = status?.text && <p className={`text-sm ${status.ok ? 'text-muted' : 'text-danger'}`}>{status.text}</p>;
  return { run, busy, message };
}

/** A settings sheet: optional explanation, the form rows, then a row of buttons. */
function Block({ title, intro, children, actions }: { title: string; intro?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Sheet title={title}>
      <div className="grid gap-5">
        {intro && <p className="text-sm text-muted">{intro}</p>}
        {children}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Sheet>
  );
}

const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, '').slice(0, 8));

export function Settings() {
  const profile = session.use().profile!;
  const wide = useMedia('(min-width: 1024px)');
  const [current, setCurrent] = useState('Profile');

  const sections: [name: string, content: ReactNode][] = [
    ['Profile', <ProfileSection key={profile.id} profile={profile} />],
    ['PIN', <PinSection />],
    ['Reminders', <NotificationSection profile={profile} />],
    ['Backup', <BackupSection profile={profile} />],
    ['Archived habits', <ArchivedSection />],
    ['Devices', <DeviceSection />],
    ['Install', <InstallSection />],
    ['Session', <SessionSection />],
    ['Delete profile', <DeleteSection profile={profile} />],
  ];

  // Laptop: a section list beside one sheet. Phone: every sheet, stacked.
  return (
    <Page title="Settings">
      {wide ? (
        <div className="grid grid-cols-[13rem_minmax(0,40rem)] items-start gap-4">
          <nav className="overflow-hidden rounded-lg border border-line bg-sheet" aria-label="Settings sections">
            {sections.map(([name]) => (
              <button
                key={name}
                type="button"
                onClick={() => setCurrent(name)}
                aria-current={name === current}
                className={`flex h-11 w-full items-center border-b border-line px-4 text-left text-sm last:border-b-0 ${name === current ? 'bg-bg/60 font-semibold' : 'text-muted hover:text-ink'}`}
              >
                {name}
              </button>
            ))}
          </nav>
          {sections.find(([name]) => name === current)![1]}
        </div>
      ) : (
        <div className="grid max-w-2xl gap-4">
          {sections.map(([name, content]) => (
            <div key={name}>{content}</div>
          ))}
        </div>
      )}
    </Page>
  );
}

function ProfileSection({ profile }: { profile: Profile }) {
  const client = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [look, setLook] = useState({ emoji: profile.emoji, color: profile.color });
  const { run, busy, message } = useAction();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      updateProfile(await api.patch<Profile>('/api/profiles/me', { name, ...look }));
      await client.invalidateQueries({ queryKey: ['profiles'] });
      return 'Profile saved.';
    });
  };

  return (
    <form onSubmit={save}>
      <Block
        title="Profile"
        actions={
          <button className="btn btn-primary" disabled={busy}>
            Save profile
          </button>
        }
      >
        <FormRow label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </FormRow>
        <LookPicker {...look} emojis={PROFILE_EMOJIS} onChange={setLook} />
        {message}
      </Block>
    </form>
  );
}

function PinSection() {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const { run, busy, message } = useAction();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('/api/auth/change-pin', { oldPin, newPin });
      setOldPin('');
      setNewPin('');
      return 'PIN changed.';
    });
  };

  return (
    <form onSubmit={save}>
      <Block
        title="PIN"
        actions={
          <button className="btn btn-primary" disabled={busy}>
            Change PIN
          </button>
        }
      >
        <FormRow label="Current PIN">
          <input className="field" type="password" inputMode="numeric" autoComplete="off" value={oldPin} onChange={digits(setOldPin)} required />
        </FormRow>
        <FormRow label="New PIN" hint="4 to 8 digits.">
          <input className="field" type="password" inputMode="numeric" autoComplete="off" value={newPin} onChange={digits(setNewPin)} minLength={4} required />
        </FormRow>
        {message}
      </Block>
    </form>
  );
}

function NotificationSection({ profile }: { profile: Profile }) {
  const [enabled, setEnabled] = useState(() => pushEnabled(profile.id));
  const { run, busy, message } = useAction();

  if (!pushSupported || needsInstallForPush) {
    return (
      <Block
        title="Reminders"
        intro={
          needsInstallForPush
            ? 'On iPhone and iPad, reminders work only after you add Non-Zero to the Home Screen and open it from there.'
            : 'This browser does not support notifications.'
        }
      />
    );
  }

  const toggle = () =>
    run(async () => {
      if (enabled) await disablePush(profile.id);
      else await enablePush(profile.id);
      setEnabled(!enabled);
      return enabled ? 'Reminders are off on this device.' : 'Reminders are on. Set a time on each habit you want to be reminded of.';
    });

  return (
    <Block
      title="Reminders"
      intro={`Reminders for ${profile.name} are ${enabled ? 'on' : 'off'} on this device. Each device is switched on separately.`}
      actions={
        <>
          <button type="button" className={`btn ${enabled ? '' : 'btn-primary'}`} disabled={busy} onClick={toggle}>
            {enabled ? 'Turn off' : 'Turn on reminders'}
          </button>
          {enabled && (
            <button type="button" className="btn" disabled={busy} onClick={() => run(async () => (await testPush(profile.id), 'Test sent. It should arrive in a few seconds.'))}>
              Send a test
            </button>
          )}
        </>
      }
    >
      {message}
    </Block>
  );
}

function BackupSection({ profile }: { profile: Profile }) {
  const client = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const { run, busy, message } = useAction();

  const exportData = () =>
    run(async () => {
      const data = await api.get<ExportFile>('/api/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `non-zero-${profile.name.toLowerCase().replace(/\W+/g, '-')}-${today()}.json` });
      link.click();
      URL.revokeObjectURL(url);
      return `Exported ${data.habits.length} habits and ${data.entries.length} entries.`;
    });

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    void run(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await chosen.text());
      } catch {
        throw new Error('That file is not a Non-Zero backup.');
      }
      const result = await api.post<{ habitsAdded: number; entriesWritten: number }>('/api/import', parsed);
      await client.invalidateQueries();
      return `Imported ${result.habitsAdded} new habits and ${result.entriesWritten} entries.`;
    });
  };

  return (
    <Block
      title="Backup"
      intro="Export this profile to a file, or merge a backup file into it."
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={exportData}>
            Export
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>
            Import
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={importData} />
        </>
      }
    >
      {message}
    </Block>
  );
}

function ArchivedSection() {
  const { data: habits = [] } = useHabits();
  const archived = habits.filter((h) => h.archivedAt);
  return (
    <Sheet title="Archived habits" flush>
      {archived.map((h) => (
        <Link key={h.id} to={`/habit/${h.id}`} className="flex h-12 items-center gap-3 border-b border-line px-4 last:border-b-0 hover:bg-bg/40">
          <span className="w-6 text-center" aria-hidden>
            {h.emoji}
          </span>
          <span className="min-w-0 flex-1 truncate">{h.name}</span>
          <span className="text-sm text-muted">Open ›</span>
        </Link>
      ))}
      {archived.length === 0 && <p className="p-4 text-sm text-muted">Nothing archived. Archive a habit from its edit page to hide it without losing its history.</p>}
    </Sheet>
  );
}

function DeviceSection() {
  const { run, busy, message } = useAction();

  const unpairOthers = () =>
    run(async () => {
      const { removed } = await api.post<{ removed: number }>('/api/device/unpair-others');
      return removed === 0 ? 'No other devices were paired.' : `Unpaired ${removed} other device${removed === 1 ? '' : 's'}.`;
    });
  const unpairThis = () =>
    run(async () => {
      await unpairDevice();
      queryClient.clear();
      return '';
    });

  return (
    <Block
      title="Devices"
      intro="Only devices paired with the admin key can reach your profiles. Lost a phone? Unpair the others from here; they will need the admin key again."
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={unpairOthers}>
            Unpair other devices
          </button>
          <button type="button" className="btn" disabled={busy} onClick={unpairThis}>
            Unpair this device
          </button>
        </>
      }
    >
      {message}
    </Block>
  );
}

function InstallSection() {
  return (
    <Block
      title="Install"
      intro="Phone: open the browser menu and choose “Add to Home Screen” (iPhone: Share, then Add to Home Screen). Laptop: use the install icon in the address bar of Chrome or Edge."
    />
  );
}

function SessionSection() {
  const leave = async () => {
    await switchProfile();
    queryClient.clear();
  };
  return (
    <Block
      title="Session"
      intro="Locking asks for the PIN again. Switching profile also signs this profile out on the server."
      actions={
        <>
          <button type="button" className="btn" onClick={lock}>
            Lock now
          </button>
          <button type="button" className="btn" onClick={leave}>
            Switch profile
          </button>
        </>
      }
    />
  );
}

function DeleteSection({ profile }: { profile: Profile }) {
  const [pin, setPin] = useState('');
  const { run, busy, message } = useAction();

  const destroy = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('/api/profiles/me/delete', { pin });
      queryClient.clear();
      profileRemoved(profile.id);
      return '';
    });
  };

  return (
    <form onSubmit={destroy}>
      <Block
        title="Delete profile"
        intro={`This deletes ${profile.name} with all of its habits and history, on every device. Enter the PIN to confirm.`}
        actions={
          <button className="btn btn-danger" disabled={busy}>
            Delete forever
          </button>
        }
      >
        <FormRow label="PIN">
          <input className="field" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={digits(setPin)} required />
        </FormRow>
        {message}
      </Block>
    </form>
  );
}
