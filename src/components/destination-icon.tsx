import type { DestinationType } from "@/types";

/**
 * Destination artwork for the activation screen.
 *
 * Small, self-contained marks in each platform's own colour so the choice a
 * customer makes is obvious at a glance. They are decorative: the visible label
 * beside each one is what carries the meaning, and the marks are hidden from
 * screen readers so nothing is announced twice.
 */

type IconProps = { className?: string };

/** Instagram's brand gradient, used for the app's own accent. */
function InstagramMark({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="tb-instagram" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0%" stopColor="#feda75" />
          <stop offset="35%" stopColor="#fa7e1e" />
          <stop offset="65%" stopColor="#d62976" />
          <stop offset="100%" stopColor="#962fbf" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="url(#tb-instagram)" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.1" stroke="url(#tb-instagram)" strokeWidth="1.9" />
      <circle cx="17.4" cy="6.6" r="1.25" fill="url(#tb-instagram)" />
    </svg>
  );
}

/** Google's four brand colours, as the G itself. */
function GoogleMark({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M21.35 11.1H12v3.1h5.35c-.23 1.4-1.66 4.1-5.35 4.1a6.1 6.1 0 1 1 0-12.2 5.4 5.4 0 0 1 3.83 1.5l2.87-2.78A8.9 8.9 0 1 0 12 21c5.1 0 8.5-3.59 8.5-8.63 0-.58-.06-1-.15-1.27Z"
        fill="#4285F4"
      />
      <path d="M3.15 7.35 6.08 4.4A9.9 9.9 0 0 0 2.1 12c0 1.9.46 3.66 1.26 5.19l3.7-2.86A6.06 6.06 0 0 1 6.1 12c0-.9.16-1.76.46-2.53l-.41-2.12Z" fill="#34A853" />
      <path d="M12 21c2.9 0 5.32-.95 7.1-2.58l-3.39-2.63c-.94.63-2.04 1-3.71 1a6.12 6.12 0 0 1-5.77-4.2l-3.7 2.86A9.9 9.9 0 0 0 12 21Z" fill="#FBBC05" />
      <path d="M6.23 12.6a6.1 6.1 0 0 1 0-1.2l-.04-.4L2.1 7.35A9.9 9.9 0 0 0 12 21l.13-.07-4.53-3.5c-.66.27-1.2.65-1.37 1.17Z" fill="#EA4335" />
    </svg>
  );
}

function WhatsAppMark({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2.1 22l5.35-1.4a9.84 9.84 0 0 0 4.59 1.17h.01c5.43 0 9.84-4.4 9.84-9.84C21.89 6.4 17.48 2 12.04 2Zm0 17.93h-.01a8.2 8.2 0 0 1-4.15-1.14l-.3-.18-3.08.8.83-3-.2-.31a8.13 8.13 0 0 1-1.25-4.33c0-4.5 3.67-8.16 8.17-8.16a8.12 8.12 0 0 1 8.16 8.17c0 4.5-3.67 8.15-8.17 8.15Zm4.48-6.11c-.25-.13-1.46-.72-1.69-.8-.22-.09-.39-.13-.55.12-.16.25-.63.8-.77.97-.14.16-.28.18-.53.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.37-1.7c-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.05-.31-.02-.44-.06-.12-.55-1.33-.76-1.81-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03 0 1.19.87 2.34.99 2.5.12.16 1.7 2.6 4.14 3.65.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.46-.6 1.66-1.17.21-.58.21-1.07.15-1.17-.06-.11-.22-.17-.47-.29Z"
        fill="#25D366"
      />
    </svg>
  );
}

function LinkMark({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M10.6 13.4a3.6 3.6 0 0 0 5.1 0l2.8-2.8a3.6 3.6 0 0 0-5.1-5.1l-1 1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M13.4 10.6a3.6 3.6 0 0 0-5.1 0l-2.8 2.8a3.6 3.6 0 0 0 5.1 5.1l1-1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Ring, tint and selected-dot styling applied to the option for each type. */
export const DESTINATION_ACCENT: Record<DestinationType, { ring: string; tint: string; text: string; dot: string }> = {
  INSTAGRAM: { ring: "ring-pink-500/45", tint: "bg-pink-50", text: "text-pink-600", dot: "border-pink-500 bg-pink-500" },
  GOOGLE_REVIEW: { ring: "ring-blue-500/45", tint: "bg-blue-50", text: "text-blue-600", dot: "border-blue-500 bg-blue-500" },
  WHATSAPP: { ring: "ring-emerald-500/45", tint: "bg-emerald-50", text: "text-emerald-600", dot: "border-emerald-500 bg-emerald-500" },
  CUSTOM: { ring: "ring-accent/45", tint: "bg-violet-50", text: "text-accent", dot: "border-accent bg-accent" },
};

export function DestinationIcon({ type, className }: { type: DestinationType; className?: string }) {
  if (type === "INSTAGRAM") return <InstagramMark className={className} />;
  if (type === "GOOGLE_REVIEW") return <GoogleMark className={className} />;
  if (type === "WHATSAPP") return <WhatsAppMark className={className} />;
  return <LinkMark className={className} />;
}