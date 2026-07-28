// Hand-drawn stickfolk, drawn as SVG paths with rounded caps and a slightly
// wandering baseline so they read as biro rather than clip art. Each one is
// about a thing Reckon actually does, so the marquee is a cast of characters
// rather than decoration.

type DoodleProps = { className?: string; title: string };

function Frame({
  children,
  className,
  title,
}: DoodleProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

// Head + body + limbs, reused so every figure is recognisably the same person.
function Body({ x = 32, armY = 34 }: { x?: number; armY?: number }) {
  return (
    <>
      <circle cx={x} cy={16} r={7} />
      <path d={`M${x} 23 L${x} 42`} />
      <path d={`M${x} ${armY} L${x - 11} ${armY + 8}`} />
      <path d={`M${x} ${armY} L${x + 11} ${armY + 8}`} />
      <path d={`M${x} 42 L${x - 9} 57`} />
      <path d={`M${x} 42 L${x + 9} 57`} />
    </>
  );
}

export function StickPaying({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <Body x={26} armY={31} />
      {/* a note held out at arm's length */}
      <path d="M39 36 h13 v8 h-13 z" />
      <path d="M43 40 h5" />
    </Frame>
  );
}

export function StickSweeping({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <Body x={24} armY={32} />
      <path d="M35 40 L47 24" />
      <path d="M42 44 L52 50" />
      <path d="M35 40 L44 47" />
    </Frame>
  );
}

export function StickWaving({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <circle cx="32" cy="16" r="7" />
      <path d="M32 23 L32 42" />
      <path d="M32 32 L21 40" />
      <path d="M32 30 L44 19" />
      <path d="M44 19 L47 14" />
      <path d="M32 42 L23 57" />
      <path d="M32 42 L41 57" />
    </Frame>
  );
}

export function StickCalendar({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <path d="M12 18 h40 v34 h-40 z" />
      <path d="M12 28 h40" />
      <path d="M22 12 v10 M42 12 v10" />
      <path d="M21 38 l5 6 l11 -13" />
    </Frame>
  );
}

export function StickCoffee({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <path d="M16 26 h28 v18 a10 10 0 0 1 -10 10 h-8 a10 10 0 0 1 -10 -10 z" />
      <path d="M44 31 h5 a5 5 0 0 1 0 10 h-5" />
      <path d="M24 12 c0 5 4 5 4 10 M34 12 c0 5 4 5 4 10" />
    </Frame>
  );
}

export function StickPizza({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <path d="M32 10 L54 52 H10 Z" />
      <path d="M18 44 h28" />
      <circle cx="32" cy="30" r="2.6" />
      <circle cx="25" cy="41" r="2.6" />
      <circle cx="39" cy="41" r="2.6" />
    </Frame>
  );
}

export function StickHouse({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <path d="M10 30 L32 12 L54 30" />
      <path d="M16 30 v22 h32 v-22" />
      <path d="M27 52 v-13 h10 v13" />
    </Frame>
  );
}

export function StickHandshake({ className, title }: DoodleProps) {
  return (
    <Frame className={className} title={title}>
      <circle cx="16" cy="18" r="6" />
      <circle cx="48" cy="18" r="6" />
      <path d="M16 24 v12 M48 24 v12" />
      <path d="M16 36 L28 40 L36 40 L48 36" />
      <path d="M16 36 L12 54 M48 36 L52 54" />
      <path d="M28 40 L32 45 L36 40" />
    </Frame>
  );
}

export const STICK_CAST = [
  { Icon: StickPaying, label: "settle up" },
  { Icon: StickSweeping, label: "chores" },
  { Icon: StickCalendar, label: "when we're free" },
  { Icon: StickPizza, label: "pizza night" },
  { Icon: StickCoffee, label: "IOU a coffee" },
  { Icon: StickHouse, label: "the flat" },
  { Icon: StickHandshake, label: "no awkwardness" },
  { Icon: StickWaving, label: "hello" },
] as const;
