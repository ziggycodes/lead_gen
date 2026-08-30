import Link from "next/link";

function LogoIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 112"
      fill="none"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path
        d="M50,98 C28,80 14,63 14,44 A36,36 0 1,1 86,44 C86,63 72,80 50,98 Z"
        fill="#141414"
      />
      <circle cx="46" cy="38" r="21" fill="#FAF9F6" />
      <circle cx="46" cy="38" r="13" fill="#C8F031" />
      <line
        x1="61"
        y1="52"
        x2="73"
        y2="64"
        stroke="#FAF9F6"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({
  href = "/",
  light = false,
}: {
  href?: string;
  light?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoIcon size={36} />
      <span
        className={`font-display text-lg font-semibold tracking-tight ${
          light ? "text-white" : "text-fg"
        }`}
      >
        leadscout
      </span>
    </Link>
  );
}
