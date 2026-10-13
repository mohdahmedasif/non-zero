import { type CSSProperties, type ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// The shared building blocks. Pages compose these and set no widths, header
// heights or cell sizes of their own, which is what keeps every screen aligned.

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-xl tracking-[0.18em] whitespace-nowrap ${className}`}>
      NON-ZERO
    </span>
  );
}

interface PageProps {
  title: ReactNode;
  /** Controls on the right of the header band. */
  actions?: ReactNode;
  /** Show a back button before the title. */
  back?: boolean;
  /** Forms and other reading-width pages. */
  narrow?: boolean;
  children: ReactNode;
}

/** A screen: one header band of fixed height, then content on the shared width. */
export function Page({ title, actions, back, narrow, children }: PageProps) {
  const navigate = useNavigate();
  return (
    <div className={narrow ? 'max-w-2xl' : ''}>
      <header className="mb-5 flex h-10 items-center gap-3">
        {back && (
          <button type="button" className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
            ‹
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-2xl leading-10 font-semibold tracking-tight">{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  );
}

interface SheetProps {
  title?: ReactNode;
  /** Shown at the right of the title row. */
  aside?: ReactNode;
  /** Drop the inner padding, for ruled rows that run edge to edge. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** A sheet of paper: the only kind of panel in the app. */
export function Sheet({ title, aside, flush, className = '', children }: SheetProps) {
  return (
    <section className={`sheet ${className}`}>
      {title && (
        <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
          <h2 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{title}</h2>
          {aside && <span className="text-sm text-muted tabular-nums">{aside}</span>}
        </div>
      )}
      <div className={flush ? '' : '@container p-4'}>{children}</div>
    </section>
  );
}

interface SquareProps {
  /** Pixel size; the same square is the tick box, the day cell and the legend key. */
  size?: number;
  fill?: string;
  checked?: boolean;
  /** Receded, for rest days. */
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
  title?: string;
  disabled?: boolean;
  children?: ReactNode;
}

export function Square({ size = 32, fill, checked, dim, selected, onClick, label, title, disabled, children }: SquareProps) {
  const style: CSSProperties = { width: size, height: size, background: fill, borderRadius: size < 20 ? 4 : 8 };
  const className = `inline-flex shrink-0 items-center justify-center border text-xs tabular-nums ${
    selected ? 'border-ink' : 'border-line'
  } ${dim ? 'opacity-40' : ''}`;
  const content = (
    <>
      {checked && (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
      {children}
    </>
  );
  if (!onClick) {
    return (
      <span className={className} style={style} title={title} aria-hidden={!label} aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" className={`${className} transition hover:border-muted active:scale-95 disabled:pointer-events-none`} style={style} onClick={onClick} title={title} aria-label={label} aria-pressed={checked} disabled={disabled}>
      {content}
    </button>
  );
}

interface FormRowProps {
  label: string;
  hint?: ReactNode;
  /** Use for a group of buttons; a single input is wrapped in a real label. */
  group?: boolean;
  children: ReactNode;
}

/** A form line: labels in one column, controls in the other, on every form. */
export function FormRow({ label, hint, group, children }: FormRowProps) {
  const Row = group ? 'div' : 'label';
  return (
    // Two columns once the sheet itself is wide enough, whatever the screen size.
    <Row className="grid gap-x-4 gap-y-1.5 @md:grid-cols-[9rem_minmax(0,1fr)]">
      <span className="label @md:pt-2.5">{label}</span>
      <span className="block min-w-0">
        {children}
        {hint && <span className="hint mt-1.5 block">{hint}</span>}
      </span>
    </Row>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="font-display text-2xl leading-9 tabular-nums">{value}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

interface ConfirmProps {
  title: string;
  children: ReactNode;
  /** Label of the button that goes ahead, e.g. "Delete". */
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The app's own confirmation dialog, for actions that cannot be undone. */
export function Confirm({ title, children, confirmLabel, busy, onConfirm, onCancel }: ConfirmProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="sheet w-full max-w-sm p-5" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Centred sheet used before a profile is open: pairing, picking, PIN. */
export function Gate({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Wordmark className="mb-6 block text-center" />
      <Sheet>
        <div className="mb-5 text-center">
          <h1 className="font-display text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 min-h-5 text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </Sheet>
    </main>
  );
}
