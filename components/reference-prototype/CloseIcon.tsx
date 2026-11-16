"use client";

export const CLOSE_ICON_CLASS = "h-4 w-4 shrink-0";

export const DEFAULT_CLOSE_BUTTON_CLASS =
  "flex shrink-0 items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-40";

export function PixelCloseIcon({ className = CLOSE_ICON_CLASS }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 19 19"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M17.5 1.5L1.5 17.5M1.5 1.5L17.5 17.5"
        stroke="var(--sds-color-icon-default-default)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseButton({
  onClick,
  disabled = false,
  className = DEFAULT_CLOSE_BUTTON_CLASS,
  ariaLabel = "닫기",
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} aria-label={ariaLabel}>
      <PixelCloseIcon />
    </button>
  );
}
