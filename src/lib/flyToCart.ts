/* ────────────────────────────────────────────────────────────
   flyToCart — clones the book cover and arcs it into the cart
   icon, then bumps the cart. Optimistic, low-stakes delight.
   No-op under prefers-reduced-motion.
   ──────────────────────────────────────────────────────────── */

function reduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function flyToCart(sourceEl: HTMLElement | null | undefined) {
  if (!sourceEl || reduced()) return;

  const cartEl =
    (document.querySelector('a[href="/cart"].header-chip') as HTMLElement | null) ||
    (document.querySelector('a[href="/cart"]') as HTMLElement | null);
  if (!cartEl) return;

  const from = sourceEl.getBoundingClientRect();
  const to = cartEl.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;

  // Build the flying clone: reuse a real <img> if present, else a navy chip.
  const sourceImg = sourceEl.querySelector('img') as HTMLImageElement | null;
  const clone = document.createElement(sourceImg ? 'img' : 'div');
  clone.className = 'fly-clone';
  if (sourceImg) (clone as HTMLImageElement).src = sourceImg.src;
  else clone.style.background =
    'linear-gradient(168deg, hsl(232 52% 22%), hsl(236 60% 11%))';

  const w = Math.min(from.width, 150);
  const h = w * 1.4;
  Object.assign(clone.style, {
    left: `${from.left + from.width / 2 - w / 2}px`,
    top: `${from.top + from.height / 2 - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
  });
  document.body.appendChild(clone);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  const anim = clone.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(0.62) rotate(-8deg)`,
        opacity: 0.95,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(-14deg)`,
        opacity: 0.15,
        offset: 1,
      },
    ],
    { duration: 720, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
  );

  let done = false;
  const settle = () => {
    if (done) return;
    done = true;
    clone.remove();
    cartEl.classList.add('cart-bump');
    setTimeout(() => cartEl.classList.remove('cart-bump'), 460);
  };

  anim.onfinish = settle;
  // Fallback: background tabs pause Web Animations, so onfinish may never
  // fire. Guarantee the clone is removed regardless.
  setTimeout(settle, 1100);
}
