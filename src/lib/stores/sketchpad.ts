import { create } from "zustand";

// ---------------------------------------------------------------------------
// The background's memory.
//
// Deliberately separate from anything the app renders in the foreground: the
// sketchpad is a *record* of what happened, not a source of truth. Nothing
// here should ever drive real behaviour — if this store were lost the app must
// still work identically, only with a blank margin.
//
// The shape mirrors how you'd actually annotate a notebook: a heading for the
// place you're in, and under it, a running list of what you did there.
// ---------------------------------------------------------------------------

/** The colored-pencil tin. Every doodle picks one of these. */
export const PENCILS = {
  indigo: "var(--pencil-indigo)",
  cherry: "var(--pencil-cherry)",
  sunshine: "var(--pencil-sunshine)",
  forest: "var(--pencil-forest)",
  graphite: "var(--pencil-graphite)",
} as const;

export type Pencil = keyof typeof PENCILS;

const PENCIL_CYCLE: Pencil[] = ["indigo", "forest", "cherry", "sunshine"];

/** Something the reader did while they were on that page. */
export type Jotting = {
  id: string;
  text: string;
  /** A tick reads as finished; a dash reads as noted-in-passing. */
  done: boolean;
};

export type Entry = {
  id: string;
  /** The heading, e.g. "Who owes who". */
  label: string;
  href: string;
  depth: number;
  pencil: Pencil;
  /** Left behind once you've moved on — crossed out, never deleted. */
  struck: boolean;
  jottings: Jotting[];
};

type SketchpadState = {
  entries: Entry[];
  section: string;
  turnKey: number;

  visitRoute: (pathname: string, label: string, section: string) => void;
  /** Records an action under whichever page the reader is currently on. */
  jot: (text: string, done?: boolean) => void;
  clear: () => void;
};

let seq = 0;
const nextId = () => `sp-${++seq}`;

// Four is enough to show a trail without the page becoming a wall of text —
// and it's how many resting places the layout has around the edges.
const MAX_ENTRIES = 4;
const MAX_JOTTINGS = 4;

export const useSketchpad = create<SketchpadState>((set) => ({
  entries: [],
  section: "",
  turnKey: 0,

  visitRoute: (pathname, label, section) =>
    set((state) => {
      if (state.entries.at(-1)?.href === pathname) return state;

      const depth = Math.max(0, pathname.split("/").filter(Boolean).length - 1);

      // Revisiting somewhere shouldn't write it twice. Drop the old copy and
      // re-add it at the end, carrying its jottings across so the record of
      // what you did there survives the round trip.
      const previous = state.entries.find((e) => e.href === pathname);
      const withoutDuplicate = state.entries.filter((e) => e.href !== pathname);

      const struck = withoutDuplicate.map((e) =>
        e.depth >= depth ? { ...e, struck: true } : e,
      );

      const entry: Entry = {
        id: previous?.id ?? nextId(),
        label,
        href: pathname,
        depth,
        pencil: previous?.pencil ?? PENCIL_CYCLE[struck.length % PENCIL_CYCLE.length],
        struck: false,
        jottings: previous?.jottings ?? [],
      };

      const sectionChanged = state.section !== "" && section !== state.section;

      return {
        entries: [...struck, entry].slice(-MAX_ENTRIES),
        section,
        turnKey: sectionChanged ? state.turnKey + 1 : state.turnKey,
      };
    }),

  jot: (text, done = true) =>
    set((state) => {
      if (state.entries.length === 0) return state;

      const index = state.entries.length - 1;
      const current = state.entries[index];

      // Don't repeat the same note twice in a row — doing the same thing
      // again should read as one line, not a stutter.
      if (current.jottings.at(-1)?.text === text) return state;

      const updated: Entry = {
        ...current,
        jottings: [...current.jottings, { id: nextId(), text, done }].slice(-MAX_JOTTINGS),
      };

      const entries = [...state.entries];
      entries[index] = updated;
      return { entries };
    }),

  clear: () => set({ entries: [], section: "", turnKey: 0 }),
}));
