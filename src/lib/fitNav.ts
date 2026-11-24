/**
 * The top menu is one row, always. As entries are added the row's type, padding and gaps shrink together (one factor,
 * `--nav-scale` on the row) until everything fits, instead of the last entries dropping to a second line. These are the
 * factors tried, largest first; the smallest keeps the type readable (15.2px × 0.7 ≈ 10.6px).
 */
export const NAV_SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7] as const;

/** The largest factor at which `fits` says the row fits (the smallest one when none does). `fits` is called with the factor already applied. */
export function pickScale(apply: (scale: number) => void, fits: () => boolean): number {
  for (const scale of NAV_SCALES) {
    apply(scale);
    if (fits()) return scale;
  }
  return NAV_SCALES[NAV_SCALES.length - 1];
}
