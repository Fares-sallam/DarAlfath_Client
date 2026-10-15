/** What every QR code on the site is drawn with: near-black modules on white, whatever the theme. */
export const QR_OPTIONS = {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 1,
  color: { dark: '#0b1b4d', light: '#ffffff' },
} as const;

/**
 * A QR code for `url` as an SVG data URI, for an <img>. The library loads only when a code is first
 * asked for, so the book page doesn't carry it for the visitors who never open one.
 */
export async function qrDataUri(url: string): Promise<string> {
  const { toString } = await import('qrcode');
  const svg = await toString(url, QR_OPTIONS);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
