import { pastel } from '../lib/color';
import { FormRow, Square } from '../ui';

export const COLORS = ['#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#e11d48', '#ea580c', '#ca8a04'];

interface Props {
  emoji: string;
  color: string;
  emojis: string[];
  onChange: (look: { emoji: string; color: string }) => void;
}

/** Icon and colour rows shared by the profile and habit forms. */
export function LookPicker({ emoji, color, emojis, onChange }: Props) {
  return (
    <>
      <FormRow label="Icon" group>
        <span className="flex flex-wrap gap-2">
          {emojis.map((e) => (
            <Square key={e} size={40} selected={e === emoji} label={`Icon ${e}`} onClick={() => onChange({ emoji: e, color })}>
              <span className="text-lg">{e}</span>
            </Square>
          ))}
          <input
            className="field !w-20 text-center"
            aria-label="Custom icon"
            placeholder="Other"
            maxLength={8}
            value={emojis.includes(emoji) ? '' : emoji}
            onChange={(e) => onChange({ emoji: e.target.value || emojis[0], color })}
          />
        </span>
      </FormRow>
      <FormRow label="Colour" group>
        <span className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <Square key={c} size={40} fill={pastel(c)} selected={c === color} checked={c === color} label={`Colour ${c}`} onClick={() => onChange({ emoji, color: c })} />
          ))}
        </span>
      </FormRow>
    </>
  );
}
