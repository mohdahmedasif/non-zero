import type { Profile } from '@non-zero/shared';
import { useEffect, useState } from 'react';
import { ApiError, api, errorMessage } from '../api/client';
import { PinPad } from '../components/PinPad';
import { unlock } from '../session';
import { FormRow, Gate } from '../ui';

interface Props {
  profile: Profile;
  onBack: () => void;
}

export function Unlock({ profile, onBack }: Props) {
  const [error, setError] = useState('');
  const [lockedUntil, setLockedUntil] = useState(0);
  const [resetting, setResetting] = useState(false);
  const wait = useCountdown(lockedUntil);

  const submit = async (pin: string) => {
    setError('');
    try {
      await unlock(profile, pin);
    } catch (err) {
      if (err instanceof ApiError) {
        if (typeof err.data?.lockedUntil === 'number') setLockedUntil(err.data.lockedUntil);
        const left = err.data?.attemptsLeft;
        setError(err.status === 401 && typeof left === 'number' ? `Wrong PIN. ${left} attempt${left === 1 ? '' : 's'} left.` : err.message);
      } else {
        setError(errorMessage(err));
      }
    }
  };

  const status =
    wait > 0 ? `Too many wrong attempts. Try again in ${formatWait(wait)}.` : error ? <span className="text-danger">{error}</span> : resetting ? 'Set a new PIN' : 'Enter your PIN';

  return (
    <Gate
      title={
        <>
          {profile.emoji} {profile.name}
        </>
      }
      subtitle={<span role="status">{status}</span>}
    >
      {resetting ? (
        <ResetPin profile={profile} onDone={() => (setResetting(false), setLockedUntil(0), setError(''))} />
      ) : (
        <PinPad onSubmit={submit} disabled={wait > 0} />
      )}
      <div className="mt-5 flex justify-between text-sm text-muted">
        <button type="button" className="underline underline-offset-4" onClick={onBack}>
          Switch profile
        </button>
        <button type="button" className="underline underline-offset-4" onClick={() => setResetting((r) => !r)}>
          {resetting ? 'Back to PIN' : 'Forgot PIN?'}
        </button>
      </div>
    </Gate>
  );
}

function ResetPin({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [adminKey, setAdminKey] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/api/profiles/${profile.id}/reset-pin`, { adminKey, pin });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormRow label="Admin key">
        <input className="field" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} autoComplete="off" required />
      </FormRow>
      <FormRow label="New PIN" hint="4 to 8 digits.">
        <input className="field" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" autoComplete="off" required minLength={4} />
      </FormRow>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn btn-primary w-full">Set new PIN</button>
    </form>
  );
}

/** Seconds left until a timestamp, ticking down to zero. */
function useCountdown(until: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (until <= Date.now()) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
