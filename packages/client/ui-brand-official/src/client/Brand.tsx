import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type OfficialBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Fenice mark: a compact rising-flame glyph drawn on the currentColor ink,
 * replacing the upstream whale art for this fork's identity.
 * @param props - Host-supplied mark presentation.
 * @returns the Fenice flame mark.
 */
export function OfficialBrandMark({ size, className }: OfficialBrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Fenice"
      className={className}
      fill="none"
    >
      <path
        d="M12 2c1.8 3.2-.6 4.9-1.9 6.6C8.7 10.5 8 12 8 13.6A4.4 4.4 0 0 0 12.4 18a4.6 4.6 0 0 0 4.6-4.7c0-1.5-.6-2.8-1.4-4 .1 1.2-.4 2-1.2 2.4.6-2.9-.4-6.6-2.4-9.7Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M12 22c-4.4 0-8-3.1-8-7.4 0-2.5 1.2-4.6 2.6-6.4-.2 1.3.2 2.3 1 2.9C7.2 8.4 8 5.4 10.2 2.6 9.4 6 11.4 7.6 13 9.6c1.5 1.9 2.6 3.7 2.6 5.9C15.6 19.3 14.2 21.3 12 22Zm0-1.8c1.5-.6 2.2-2 2.2-3.7 0-1.4-.7-2.7-1.9-4.2-.3.9-.9 1.4-1.6 1.7.3-1.1.2-2.3-.4-3.6-1 1.7-1.9 3.3-1.9 5.2 0 2.2 1.4 4.1 3.6 4.6Z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * Render the Fenice wordmark as live text (accessible, localizable, and free
 * of upstream vector art) without its independently slotted mark.
 * @returns the wordmark.
 */
export function OfficialBrandName() {
  return (
    <span
      style={{ fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}
    >
      Fenice
    </span>
  )
}
