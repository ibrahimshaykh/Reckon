import { create } from "zustand";

// ---------------------------------------------------------------------------
// The background's memory.
//
// Deliberately separate from anything the app renders in the foreground: the
// sketchpad is a *record* of what happened, not a source of truth. Nothing
// here should ever drive real behaviour — if this store were lost the app must
// still work identically, only with a blank margin.
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

const PENCIL_CYCLE: Pencil[] = ["indigo", "cherry", "forest", "sunshine"];

export type Crumb = {
  id: string;
  /** What gets written in the margin, e.g. "Who owes who". */
  label: string;
  href: string;
  /** How deep in the path this step sits — drives indent and size. */
  depth: number;
  pencil: Pencil;
  /** Older steps get scribbled out rather than removed. */
  struck: boolean;
};

export type MarginItem = {
  id: string;
  kind: "expense" | "group" | "person" | "chore" | "note";
  label: string;
  detail?: string;
  pencil: Pencil;
  /** Placement in the margin, as a percentage of the viewport. */
  x: number;
  y: number;
  rot: number;
  /** How it's attached to the paper. */
  fixing: "tape" | "pin" | "staple";
};

type SketchpadState = {
  trail: Crumb[];
  items: MarginItem[];
  /** Bumped whenever the top-level section changes, to trigger a page turn. */
  section: string;
  turnKey: number;

  visitRoute: (pathname: string, label: string, section: string) => void;
  pin: (item: Pick<MarginItem, "kind" | "label" | "detail">) => void;
  unpin: (id: string) => void;
  clear: () => void;
};

let seq = 0;
const nextId = () => `sp-${++seq}`;

// Margins only — the middle of the page belongs to the app. Items land in the
// left or right gutter, biased away from the top where breadcrumbs live.
function scatter(index: number) {
  const rightSide = index % 2 === 1;
  return {
    x: rightSide ? 79 + ((index * 7) % 11) : 2 + ((index * 5) % 9),
    y: 28 + ((index * 23) % 56),
    rot: ((index * 37) % 16) - 8,
  };
}

const FIXINGS: MarginItem["fixing"][] = ["tape", "pin", "staple"];

export const useSketchpad = create<SketchpadState>((set) => ({
  trail: [],
  items: [],
  section: "",
  turnKey: 0,

  visitRoute: (pathname, label, section) =>
    set((state) => {
      // Revisiting the same place shouldn't stack duplicates in the margin.
      if (state.trail.at(-1)?.href === pathname) return state;

      const depth = Math.max(0, pathname.split("/").filter(Boolean).length - 1);

      // Anything at the same depth or deeper is now historical — strike it
      // through rather than deleting, so the page keeps a visible record of
      // the route taken to get here.
      const struckTrail = state.trail.map((c) =>
        c.depth >= depth ? { ...c, struck: true } : c,
      );

      const crumb: Crumb = {
        id: nextId(),
        label,
        href: pathname,
        depth,
        pencil: PENCIL_CYCLE[struckTrail.length % PENCIL_CYCLE.length],
        struck: false,
      };

      const sectionChanged = state.section !== "" && section !== state.section;

      return {
        // Six is about what fits down the margin before it turns to mush.
        trail: [...struckTrail, crumb].slice(-6),
        section,
        turnKey: sectionChanged ? state.turnKey + 1 : state.turnKey,
      };
    }),

  pin: (item) =>
    set((state) => {
      const index = state.items.length;
      const placed: MarginItem = {
        ...item,
        id: nextId(),
        pencil: PENCIL_CYCLE[index % PENCIL_CYCLE.length],
        fixing: FIXINGS[index % FIXINGS.length],
        ...scatter(index),
      };
      // Cap it: past a point the margin is full and older notes get painted
      // over, which is also what happens to a real notebook.
      return { items: [...state.items, placed].slice(-8) };
    }),

  unpin: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  clear: () => set({ trail: [], items: [] }),
}));
