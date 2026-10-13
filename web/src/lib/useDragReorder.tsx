import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';

const ROW_ATTR = 'data-reorder-id';

/**
 * Drag-to-reorder for a vertical list, by mouse, touch or pen. Rows spread
 * `row(id)`, their grip spreads `grip(id)`; dropping one row on another calls
 * `onMove(id, targetId)`. Arrow keys on a focused grip move it one place.
 */
export function useDragReorder(ids: string[], onMove: (id: string, targetId: string) => void) {
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  // Pointer events fire faster than renders, so they read the drag from a ref.
  const current = useRef(drag);
  const update = (next: typeof drag) => {
    current.current = next;
    setDrag(next);
  };

  const rowAt = (y: number): string | null => {
    for (const el of document.querySelectorAll(`[${ROW_ATTR}]`)) {
      const box = el.getBoundingClientRect();
      if (y >= box.top && y < box.bottom) return el.getAttribute(ROW_ATTR);
    }
    return null;
  };

  const finish = (commit: boolean) => {
    const done = current.current;
    update(null);
    if (commit && done?.over && done.over !== done.id) onMove(done.id, done.over);
  };

  return {
    /** Id of the row being dragged, if any. */
    dragging: drag?.id ?? null,
    row: (id: string) => ({ [ROW_ATTR]: id }),
    /** Where the drop line belongs on a row: above it, below it, or nowhere. */
    marker: (id: string): 'before' | 'after' | null => {
      if (!drag || drag.over !== id || drag.id === id) return null;
      return ids.indexOf(id) < ids.indexOf(drag.id) ? 'before' : 'after';
    },
    grip: (id: string) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        update({ id, over: null });
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (!current.current) return;
        const over = rowAt(e.clientY);
        if (over !== current.current.over) update({ id: current.current.id, over });
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const target = ids[ids.indexOf(id) + step];
        if (!step || !target) return;
        e.preventDefault();
        onMove(id, target);
      },
    }),
  };
}

type GripProps = ReturnType<ReturnType<typeof useDragReorder>['grip']> & { label: string; className?: string };

/** The six-dot handle a row is dragged by. */
export function Grip({ label, className = '', ...handlers }: GripProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Drag to reorder"
      // touch-none stops the page scrolling while a finger drags the handle.
      className={`flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-ink active:cursor-grabbing ${className}`}
      {...handlers}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden>
        {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
      </svg>
    </button>
  );
}

/** The line showing where a dragged row will land. */
export function DropLine({ at }: { at: 'before' | 'after' | null }) {
  if (!at) return null;
  return <span className={`pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-ink ${at === 'before' ? 'top-0' : 'bottom-0'}`} />;
}
