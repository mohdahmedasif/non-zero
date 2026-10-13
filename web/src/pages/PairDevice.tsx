import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { pairDevice } from '../session';
import { FormRow, Gate } from '../ui';

/** Shown to a browser the server does not know yet; the admin key lets it in. */
export function PairDevice() {
  const client = useQueryClient();
  const [adminKey, setAdminKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await pairDevice(adminKey.trim());
      await client.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Gate title="Pair this device" subtitle="Enter the admin key once to use Non-Zero here.">
      <form onSubmit={submit} className="grid gap-5">
        <FormRow label="Admin key">
          <input className="field" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} required autoFocus />
        </FormRow>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          Pair device
        </button>
      </form>
    </Gate>
  );
}
