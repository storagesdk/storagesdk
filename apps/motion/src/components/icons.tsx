import type React from 'react';

type IconProps = { size?: number; color?: string };

export const FileIcon: React.FC<IconProps> = ({
  size = 20,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M6 3h8l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3Z"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M14 3v4h4"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const FolderIcon: React.FC<IconProps> = ({
  size = 20,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.4h7A1.5 1.5 0 0 1 19 8.9V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17V6.5Z"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const BranchIcon: React.FC<IconProps> = ({
  size = 20,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="6" cy="5" r="2.4" stroke={color} strokeWidth="1.6" />
    <circle cx="6" cy="19" r="2.4" stroke={color} strokeWidth="1.6" />
    <circle cx="18" cy="7" r="2.4" stroke={color} strokeWidth="1.6" />
    <path
      d="M6 7.4v9.2M6 12c0-3 1.5-5 5.5-5h4"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const CameraIcon: React.FC<IconProps> = ({
  size = 20,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="3"
      y="7"
      width="18"
      height="13"
      rx="2.4"
      stroke={color}
      strokeWidth="1.6"
    />
    <path
      d="M8 7l1.6-2.4h4.8L16 7"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="13.5" r="3.2" stroke={color} strokeWidth="1.6" />
  </svg>
);

export const CodeIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GlobeIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
    <path
      d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"
      stroke={color}
      strokeWidth="1.6"
    />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({
  size = 16,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="m5 12.5 4.5 4.5L19 6.5"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** storagesdk mark — stacked "layers" suggesting one API over many stores. */
export const Logo: React.FC<IconProps> = ({
  size = 28,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3 21 8l-9 5-9-5 9-5Z"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="m3 12 9 5 9-5"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
      opacity={0.7}
    />
    <path
      d="m3 16 9 5 9-5"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
      opacity={0.4}
    />
  </svg>
);
