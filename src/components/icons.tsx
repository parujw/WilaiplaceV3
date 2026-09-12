type P = { className?: string };
const base = "h-5 w-5";

export const IconHome = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"
      stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9.5 20.5v-5h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

export const IconBuilding = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <rect x="4" y="3" width="11" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M15 9h4.2A.8.8 0 0 1 20 9.8V21h-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M7.5 7h1.5M7.5 11h1.5M7.5 15h1.5M11 7h1.5M11 11h1.5M11 15h1.5"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconUsers = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="9.5" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.5 20c0-3.2 2.7-5.3 6-5.3s6 2.1 6 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16.3 5.2a3 3 0 0 1 0 5.6M18 19.6c0-2.3-.8-4-2.2-5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconWrench = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconDoor = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M6 3.5h9A1.5 1.5 0 0 1 16.5 5v16H6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="13" cy="12.5" r="1" fill="currentColor" />
    <path d="M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconWallet = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" />
  </svg>
);

export const IconGauge = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 17a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m12 16 3.4-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1.4" fill="currentColor" />
  </svg>
);

export const IconReceipt = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M5 3.5h14v17l-2.3-1.4-2.4 1.4-2.3-1.4-2.4 1.4L7.3 19 5 20.5z"
      stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 8.5h6M9 12.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconBell = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10"
      stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconPlus = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconChevron = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconBack = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCamera = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 8.5h3l1.3-2h7.4l1.3 2H20A1.5 1.5 0 0 1 21.5 10v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5"
      stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const IconPin = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21"
      stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="10.5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const IconGoogle = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4" />
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22" />
    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9z" />
    <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1" />
  </svg>
);
