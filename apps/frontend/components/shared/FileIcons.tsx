
/** Shared file/folder SVG icons used by FileTree and QuickSwitcher. */

export function FolderIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H7.08579C7.35097 3.5 7.60536 3.60536 7.79289 3.79289L9.20711 5.20711C9.39464 5.39464 9.64903 5.5 9.91421 5.5H15.5C16.6046 5.5 17.5 6.39543 17.5 7.5V14.5C17.5 15.6046 16.6046 16.5 15.5 16.5H4.5C3.39543 16.5 2.5 15.6046 2.5 14.5V5.5Z"
        fill={open ? "currentColor" : "none"}
        fillOpacity={open ? 0.12 : 0}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M5 3.5C4.72386 3.5 4.5 3.72386 4.5 4V16C4.5 16.2761 4.72386 16.5 5 16.5H15C15.2761 16.5 15.5 16.2761 15.5 16V7.41421C15.5 7.28161 15.4473 7.15443 15.3536 7.06066L11.9393 3.64645C11.8456 3.55268 11.7184 3.5 11.5858 3.5H5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 3.5V7C11.5 7.27614 11.7239 7.5 12 7.5H15.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
