/**
 * A one-line note at the bottom of the screen ("اتنسخ الرابط"), read out by screen readers, gone after a
 * moment. One at a time: a new note replaces the one on screen.
 */
let current: { el: HTMLElement; timer: number } | null = null;

export function showToast(message: string, ms = 2400): void {
  if (typeof document === 'undefined') return;
  if (current) {
    window.clearTimeout(current.timer);
    current.el.remove();
  }
  const el = document.createElement('div');
  el.className = 'site-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  document.body.appendChild(el);
  // next frame, so the entrance transition runs
  requestAnimationFrame(() => el.classList.add('site-toast--in'));
  const timer = window.setTimeout(() => {
    el.classList.remove('site-toast--in');
    window.setTimeout(() => el.remove(), 300);
    if (current?.el === el) current = null;
  }, ms);
  current = { el, timer };
}
