import type { Profile } from '@non-zero/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useProfiles } from '../api/queries';
import { COLORS, LookPicker } from '../components/LookPicker';
import { pastel } from '../lib/color';
import { FormRow, Gate } from '../ui';
import { Unlock } from './Unlock';

export const PROFILE_EMOJIS = ['🌱', '💼', '💪', '📚', '🧘', '🏠', '🎯', '🎨'];

export function ProfilePicker() {
  const { data: profiles, isPending, error } = useProfiles();
  const [chosen, setChosen] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  if (chosen) return <Unlock profile={chosen} onBack={() => setChosen(null)} />;
  if (creating) return <CreateProfile onDone={() => setCreating(false)} />;

  return (
    <Gate title="Profiles" subtitle="Who is tracking today?">
      {isPending && <p className="text-center text-sm text-muted">Loading profiles…</p>}
      {error && !profiles && <p className="text-center text-sm text-danger">{errorMessage(error)}</p>}
      <ul className="-mx-4 border-t border-line">
        {profiles?.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setChosen(p)} className="flex h-14 w-full items-center gap-3 border-b border-line px-4 text-left hover:bg-bg/40">
              <span className="flex size-8 items-center justify-center rounded-md border border-line" style={{ background: pastel(p.color) }}>
                {p.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-muted" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      {profiles?.length === 0 && <p className="py-4 text-center text-sm text-muted">No profiles yet. Create your first one.</p>}
      <button type="button" className="btn mt-4 w-full" onClick={() => setCreating(true)}>
        + New profile
      </button>
    </Gate>
  );
}

function CreateProfile({ onDone }: { onDone: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [look, setLook] = useState({ emoji: PROFILE_EMOJIS[0], color: COLORS[0] });
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, '').slice(0, 8));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== confirm) return setError('The two PINs do not match');
    setError('');
    setBusy(true);
    try {
      await api.post('/api/profiles', { name, ...look, pin });
      await client.invalidateQueries({ queryKey: ['profiles'] });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Gate title="New profile" subtitle="Each profile has its own habits and PIN.">
      <form onSubmit={submit} className="grid gap-5">
        <FormRow label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Health, Work…" maxLength={40} required autoFocus />
        </FormRow>
        <LookPicker {...look} emojis={PROFILE_EMOJIS} onChange={setLook} />
        <FormRow label="PIN" hint="4 to 8 digits.">
          <input className="field" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={digits(setPin)} minLength={4} required />
        </FormRow>
        <FormRow label="Repeat PIN">
          <input className="field" type="password" inputMode="numeric" autoComplete="off" value={confirm} onChange={digits(setConfirm)} minLength={4} required />
        </FormRow>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Create
          </button>
        </div>
      </form>
    </Gate>
  );
}
