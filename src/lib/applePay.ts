declare global {
  interface Window {
    // Only ever defined by Safari on an Apple device: used as a presence/capability check, never invoked
    // (Paymob's own hosted checkout page drives the real Apple Pay sheet).
    ApplePaySession?: {
      canMakePayments: () => boolean;
    };
  }
}

/**
 * True only in a browser that can plausibly complete an Apple Pay sheet (Safari on macOS/iOS/iPadOS with
 * Apple Pay set up). Every other browser (Chrome, Firefox, Edge, Android, desktop anything) never defines
 * `window.ApplePaySession`, so the option stays hidden there instead of leading to a payment page with no
 * way to pay.
 */
export function isApplePaySupported(): boolean {
  if (typeof window === 'undefined' || !window.ApplePaySession) return false;
  try {
    return window.ApplePaySession.canMakePayments();
  } catch {
    return false;
  }
}

/** Where "شراء سريع" sends a customer whose device can pay with Apple Pay: checkout in its one-screen form. */
export const EXPRESS_CHECKOUT_PATH = '/checkout?express=applepay';
