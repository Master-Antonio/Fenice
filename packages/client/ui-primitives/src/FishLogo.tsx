import type { IconProps } from './icons/props.ts'

/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
export const FISH_LOGO_VIEWBOX = { width: 24, height: 24 }

/** The Phoenix silhouette path data. */
export const FISH_LOGO_PATH =
  'M12 1.5c-.8 1.8-.4 3.5.8 4.8-2-1.2-4.2-1.2-6-.2 1.5 1 3.2 1.5 4.8 1.2-2.5.8-4.2 2.2-5.2 4.2 1.5 0 3-.5 4.2-1.2-1.5 1.8-2.2 4-2 6.2 1.2-1.2 2.4-2.5 3-4.2-.2 2.2.4 4.5 1.8 6.5.5-1.8 1.2-3.5 2.4-4.8-.8 2.5-.5 5 1 7.2.8-2.2 1.2-4.8.8-7.2 1.2 1.5 3 2.2 4.8 1.8-1.2-1.8-2-3.8-2.2-6 1.2.2 2.5-.2 3.2-1.2-1.2-.2-2.2-.8-2.8-1.8 1.2-.2 2.2-1 2.8-2.2-2 .5-3.5 1.5-4.2 3-.5-1.5-1.5-2.8-3-3.5.8 1 1 2.2.8 3.5-.8-2-1.8-3.8-3.2-5.8z'

/**
 * Render the Phoenix brand logo mark.
 * @param props.size - width in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg.
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={FISH_LOGO_PATH} fill="currentColor" />
    </svg>
  )
}
