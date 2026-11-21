/** What every QR code on the site is drawn with: dark navy modules on white, whatever the theme. */
export const QR_COLOR = '#002046';
const QUIET_ZONE = 2;
/** The three big squares in the corners that a scanner finds the code by, each 7 modules wide. */
const FINDER = 7;

/** A rounded rectangle as a path (clockwise), with `r` as the corner radius. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const f = (n: number) => +n.toFixed(3);
  return (
    `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}` +
    `a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}` +
    `v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`
  );
}

/**
 * The code for `modules` (a square grid, true = dark) as an SVG: the data modules are plain squares, and the three
 * corner finders are drawn rounded (a rounded ring around a rounded square) instead of with sharp corners. The shapes
 * keep the finders' proportions (a 1-module ring, a 3-module centre), so a scanner reads it as any other code.
 */
export function qrSvgFromModules(size: number, isDark: (row: number, col: number) => boolean): string {
  const inFinder = (row: number, col: number) =>
    (row < FINDER && col < FINDER) || (row < FINDER && col >= size - FINDER) || (row >= size - FINDER && col < FINDER);

  // data modules: one rectangle per horizontal run of dark modules, all in one path
  let data = '';
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!isDark(row, col) || inFinder(row, col)) { col++; continue; }
      const start = col;
      while (col < size && isDark(row, col) && !inFinder(row, col)) col++;
      data += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h${-(col - start)}z`;
    }
  }

  // finders: ring (outer rounded rect minus an inner one) and centre
  let finders = '';
  for (const [row, col] of [[0, 0], [0, size - FINDER], [size - FINDER, 0]]) {
    const x = col + QUIET_ZONE;
    const y = row + QUIET_ZONE;
    finders += roundedRect(x, y, 7, 7, 2.1) + roundedRect(x + 1, y + 1, 5, 5, 1.2) + roundedRect(x + 2, y + 2, 3, 3, 0.9);
  }

  const total = size + QUIET_ZONE * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path fill="${QR_COLOR}" d="${data}"/>` +
    // the ring and the centre are separate shapes: even-odd leaves the gap between them white
    `<path fill="${QR_COLOR}" fill-rule="evenodd" d="${finders}"/>` +
    `</svg>`
  );
}

/**
 * A QR code for `url` as an SVG data URI, for an <img>. The library loads only when a code is first
 * asked for, so the book page doesn't carry it for the visitors who never open one.
 */
export async function qrDataUri(url: string): Promise<string> {
  const { create } = await import('qrcode');
  const qr = create(url, { errorCorrectionLevel: 'M' });
  const svg = qrSvgFromModules(qr.modules.size, (row, col) => Boolean(qr.modules.get(row, col)));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
