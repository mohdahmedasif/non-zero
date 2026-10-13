import { useEffect, useRef, useState } from 'react';

export const PIN_MIN = 4;
export const PIN_MAX = 8;

interface Props {
  /** Called with the entered PIN. The pad clears itself afterwards. */
  onSubmit: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  submitLabel?: string;
}

/** Numeric keypad that also takes digits, Backspace and Enter from a keyboard. */
export function PinPad({ onSubmit, disabled = false, submitLabel = 'Unlock' }: Props) {
  const [pin, setPinState] = useState('');
  const [busy, setBusy] = useState(false);
  // Mirrors `pin` so keys arriving faster than React re-renders are not lost.
  const latest = useRef('');
  const setPin = (next: string) => {
    latest.current = next;
    setPinState(next);
  };
  const blocked = disabled || busy;
  const ready = pin.length >= PIN_MIN && !blocked;

  const press = (digit: string) => latest.current.length < PIN_MAX && setPin(latest.current + digit);
  const erase = () => setPin(latest.current.slice(0, -1));
  const submit = async () => {
    const entered = latest.current;
    if (entered.length < PIN_MIN || blocked) return;
    setBusy(true);
    try {
      await onSubmit(entered);
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blocked || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') erase();
      else if (e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const key = 'h-14 rounded-xl border border-line bg-sheet text-xl tabular-nums hover:border-muted active:bg-bg disabled:opacity-40';

  return (
    <div>
      <div className="mb-5 flex h-4 items-center justify-center gap-2.5" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(PIN_MIN, pin.length) }, (_, i) => (
          <span key={i} className={`size-3 rounded-[3px] border ${i < pin.length ? 'border-ink bg-ink' : 'border-muted'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} disabled={blocked} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={key} disabled={blocked || !pin} onClick={erase} aria-label="Delete last digit">
          ⌫
        </button>
        <button type="button" className={key} disabled={blocked} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className={`${key} !border-ink !bg-ink !text-sm font-medium text-sheet`} disabled={!ready} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
