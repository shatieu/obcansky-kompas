/** Ikony z design systému (24px mřížka, 2px tah, hranaté konce). Žádné Lucide. */
const PATHS = {
  "arrow-right": "M4 12h15M13 6l6 6-6 6",
  "chevron-right": "M9 5l7 7-7 7",
  "chevron-down": "M5 9l7 7 7-7",
  close: "M5 5l14 14M19 5L5 19",
  info: "M12 10.5V17M12 7v.01M3 3h18v18H3z",
  alert: "M12 7v6.5M12 16.5v.01M3 3h18v18H3z",
  mail: "M3 5h18v14H3zM3 5l9 8 9-8",
  share: "M12 15V3M7 8l5-5 5 5M5 12v9h14v-9",
  compare: "M4 7h11M4 17h16M19 4v6M15 14v6",
  law: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
