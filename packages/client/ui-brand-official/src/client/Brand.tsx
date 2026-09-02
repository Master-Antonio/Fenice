export interface OfficialBrandMarkProps {
  size?: number | undefined
  className?: string | undefined
}

export const FENICE_LOGO_VIEWBOX = { width: 24, height: 24 }

export const FENICE_LOGO_PATH =
  'M12 1.5c-.8 1.8-.4 3.5.8 4.8-2-1.2-4.2-1.2-6-.2 1.5 1 3.2 1.5 4.8 1.2-2.5.8-4.2 2.2-5.2 4.2 1.5 0 3-.5 4.2-1.2-1.5 1.8-2.2 4-2 6.2 1.2-1.2 2.4-2.5 3-4.2-.2 2.2.4 4.5 1.8 6.5.5-1.8 1.2-3.5 2.4-4.8-.8 2.5-.5 5 1 7.2.8-2.2 1.2-4.8.8-7.2 1.2 1.5 3 2.2 4.8 1.8-1.2-1.8-2-3.8-2.2-6 1.2.2 2.5-.2 3.2-1.2-1.2-.2-2.2-.8-2.8-1.8 1.2-.2 2.2-1 2.8-2.2-2 .5-3.5 1.5-4.2 3-.5-1.5-1.5-2.8-3-3.5.8 1 1 2.2.8 3.5-.8-2-1.8-3.8-3.2-5.8z'

/**
 * Fenice Phoenix Mark: A distinct, iconic vector silhouette of a soaring Phoenix.
 * @param props - Host/Sidebar/Hero-supplied mark presentation.
 * @returns the Fenice Phoenix mark SVG element.
 */
export function OfficialBrandMark({ size = 24, className }: OfficialBrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Fenice"
      className={className}
    >
      <path d={FENICE_LOGO_PATH} fill="currentColor" />
    </svg>
  )
}

/**
 * Render the Fenice wordmark as clean typography matching the UI theme.
 * @returns the wordmark.
 */
export function OfficialBrandName() {
  return (
    <span
      style={{
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        fontSize: '15px',
      }}
    >
      Fenice
    </span>
  )
}
