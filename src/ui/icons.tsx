import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}
    >
      {children}
    </svg>
  )
}

export const BridgeMark = (props: IconProps) => (
  <svg viewBox="0 0 48 32" width="40" height="27" aria-hidden="true" focusable="false" {...props}>
    <path d="M3 22h42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M7 22c4-10 30-10 34 0" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M13 15.6V22M19 13.2V22M24 12.6V22M29 13.2V22M35 15.6V22" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M7 22v6M41 22v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

export const HelpIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7" /><path d="M12 17.2h.01" /></Icon>
)
export const StatsIcon = (props: IconProps) => (
  <Icon {...props}><path d="M5 20V11M12 20V5M19 20v-6" /></Icon>
)
export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)
export const CheckIcon = (props: IconProps) => <Icon strokeWidth="2.6" {...props}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
export const CrossIcon = (props: IconProps) => <Icon strokeWidth="2.6" {...props}><path d="M7 7l10 10M17 7L7 17" /></Icon>
export const BulbIcon = (props: IconProps) => (
  <Icon {...props}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" /></Icon>
)
export const ShareIcon = (props: IconProps) => (
  <Icon {...props}><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></Icon>
)
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="M6 6l12 12M18 6 6 18" /></Icon>
export const ArrowIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
export const RefreshIcon = (props: IconProps) => (
  <Icon {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Icon>
)
export const CopyIcon = (props: IconProps) => (
  <Icon {...props}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>
)
export const InfoIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></Icon>
)
export const TrophyIcon = (props: IconProps) => (
  <Icon {...props}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8.5 20h7M10 17h4v3h-4z" /></Icon>
)
export const TimerIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M10 2h4" /></Icon>
)
