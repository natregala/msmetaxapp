import type { SVGProps } from "react";

type IconName =
  | "plus"
  | "arrow"
  | "check"
  | "refresh"
  | "record"
  | "shop"
  | "info"
  | "lock"
  | "spark"
  | "exit";
const paths: Record<IconName, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="m13 5 7 7-7 7M4 12h16" />,
  check: <path d="m5 12 4 4L19 6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6" />
    </>
  ),
  record: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  shop: (
    <>
      <path d="M3 9h18l-2-6H5L3 9Zm2 0v12h14V9M9 21v-7h6v7M3 9v1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  spark: (
    <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" />
  ),
  exit: (
    <>
      <path d="M10 4H4v16h6m5-13 5 5-5 5m-5-5h10" />
    </>
  ),
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
