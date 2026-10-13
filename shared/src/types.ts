export type HabitType = 'boolean' | 'quantity';

export interface Profile {
  id: string;
  name: string;
  color: string;
  emoji: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  type: HabitType;
  /** Amount needed for the day to count. Always 1 for boolean habits. */
  target: number;
  unit: string;
  /** Bitmask of scheduled weekdays, bit 0 = Sunday. 127 = every day. */
  weekdays: number;
  /** "HH:MM" in the device's local time, or null for no reminder. */
  reminderTime: string | null;
  sortOrder: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Entry {
  habitId: string;
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  value: number;
  updatedAt: number;
}

export type HabitInput = Pick<
  Habit,
  'name' | 'emoji' | 'color' | 'type' | 'target' | 'unit' | 'weekdays' | 'reminderTime'
>;

export interface ExportFile {
  version: 1;
  exportedAt: number;
  profile: Pick<Profile, 'name' | 'color' | 'emoji'>;
  habits: Habit[];
  entries: Entry[];
}
