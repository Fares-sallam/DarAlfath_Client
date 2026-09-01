import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductItem, ProductVariantItem } from '@/types/store';
import { useCountry } from '@/contexts/CountryContext';
import { useStoreSettings } from '@/hooks/useStorefront';
import { supabase } from '@/lib/supabase';

export interface CartItem {
  key: string;
  product_id: string;
  variant_id: string;
  title: string;
  variant_name: string;
  variant_type: string;
  price: number;
  quantity: number;
  image?: string | null;
  is_digital: boolean;
  available_stock?: number | null;
  currency_symbol: string;
  /** Per-unit weight — feeds the real governorate+weight shipping quote
   *  (useShippingRate). null for a cart item added before this field
   *  existed; falls back to the same 0.3kg default the server itself
   *  uses for a variant with no recorded weight. */
  weight_kg?: number | null;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  shipping: number;
  total: number;
  currencySymbol: string;
  freeShippingThreshold: number;
  remainingForFreeShipping: number;
  /** Total physical weight of the cart in kg (digital items excluded,
   *  0.3kg default per item with no recorded weight) — feeds the real
   *  governorate+weight shipping quote (useShippingRate) on checkout. */
  cartWeightKg: number;
  addToCart: (product: ProductItem, variant: ProductVariantItem, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  /** Titles dropped by the staleness reconciliation, for a one-time notice. */
  unavailableRemoved: string[];
  dismissUnavailableNotice: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = 'daralfath_client_cart';
const DEFAULT_SHIPPING_FLAT_RATE = 45;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 499;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function clampQuantity(quantity: number, isDigital: boolean, stock?: number | null) {
  if (isDigital) return 1;
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  return stock == null ? safeQuantity : Math.min(safeQuantity, Math.max(1, stock));
}

const normalizeStoredItem = (value: unknown): CartItem | null => {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const productId = isNonEmptyString(raw.product_id) ? raw.product_id : isNonEmptyString(raw.productId) ? raw.productId : null;
  const variantId = isNonEmptyString(raw.variant_id) ? raw.variant_id : isNonEmptyString(raw.variantId) ? raw.variantId : null;

  if (!productId || !variantId) return null;

  const price = Number(raw.price);
  if (!Number.isFinite(price) || price < 0) return null;

  const isDigital = Boolean(raw.is_digital);
  const stock = raw.available_stock == null ? null : Math.max(0, Math.floor(Number(raw.available_stock)));
  const quantity = clampQuantity(Number(raw.quantity), isDigital, stock);
  const currencySymbol = isNonEmptyString(raw.currency_symbol)
    ? raw.currency_symbol
    : isNonEmptyString(raw.currencySymbol)
      ? raw.currencySymbol
      : 'ج.م';

  return {
    key: isNonEmptyString(raw.key) ? raw.key : `${productId}:${variantId}:${currencySymbol}`,
    product_id: productId,
    variant_id: variantId,
    title: isNonEmptyString(raw.title) ? raw.title : 'منتج',
    variant_name: isNonEmptyString(raw.variant_name) ? raw.variant_name : isNonEmptyString(raw.format) ? raw.format : 'نسخة',
    variant_type: isNonEmptyString(raw.variant_type) ? raw.variant_type : isDigital ? 'رقمي' : 'ورقي',
    price,
    quantity,
    image: typeof raw.image === 'string' ? raw.image : typeof raw.coverUrl === 'string' ? raw.coverUrl : null,
    is_digital: isDigital,
    available_stock: isDigital ? null : stock,
    currency_symbol: currencySymbol,
    weight_kg: raw.weight_kg != null && Number.isFinite(Number(raw.weight_kg)) ? Number(raw.weight_kg) : null,
  };
};

function loadCartFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredItem).filter(Boolean) as CartItem[];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { selectedCountry } = useCountry();
  const { data: storeSettings } = useStoreSettings();

  const shippingFlatRate = Number(storeSettings?.default_shipping_cost) || DEFAULT_SHIPPING_FLAT_RATE;
  const freeShippingThresholdValue = Number(storeSettings?.free_shipping_threshold) || DEFAULT_FREE_SHIPPING_THRESHOLD;

  // Lazy initializer: reads localStorage synchronously on first render
  // so cart is populated before any effect can overwrite it with []
  const [items, setItems] = useState<CartItem[]>(loadCartFromStorage);

  const [unavailableRemoved, setUnavailableRemoved] = useState<string[]>([]);
  // Variant-id sets already reconciled, so this never loops on its own writes.
  const reconciledRef = useRef<string>('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // The cart lives in localStorage and keeps whatever was in it when the item
  // was added. If a product is later deleted or deactivated, the stale row
  // survives here, the UI happily renders it, and checkout dies at the last
  // step with "لم نجد أي منتجات بهذه المعرّفات" — with no way for the customer
  // to tell which item is at fault. Reconcile against the public catalog and
  // drop what can no longer be bought, telling the customer what happened.
  useEffect(() => {
    const variantIds = items.map((item) => item.variant_id);
    if (variantIds.length === 0) return;

    const signature = [...variantIds].sort().join(',');
    if (reconciledRef.current === signature) return;

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from('product_variants_public')
        .select('variant_id')
        .in('variant_id', variantIds);

      // Fail open: a network blip must never empty someone's cart.
      if (cancelled || error || !data) return;

      const liveIds = new Set(data.map((row) => row.variant_id as string));
      const missing = items.filter((item) => !liveIds.has(item.variant_id));

      reconciledRef.current = signature;
      if (missing.length === 0) return;

      setUnavailableRemoved(missing.map((item) => item.title));
      setItems((prev) => prev.filter((item) => liveIds.has(item.variant_id)));
    })();

    return () => { cancelled = true; };
  }, [items]);

  const dismissUnavailableNotice = () => setUnavailableRemoved([]);

  const addToCart = (
    product: ProductItem,
    variant: ProductVariantItem,
    quantity = 1
  ) => {
    if (!variant.is_available) return;

    const currencySymbol = variant.currency_symbol || product.currency_symbol;
    const key = `${product.product_id}:${variant.variant_id}:${variant.country_code || product.country_code || currencySymbol}`;
    const requestedQuantity = clampQuantity(quantity, variant.is_digital, variant.available_stock);

    setItems((prev) => {
      const existing = prev.find((item) => item.key === key);

      if (existing) {
        return prev.map((item) =>
          item.key === key
            ? {
              ...item,
              title: product.title,
              variant_name: variant.variant_name,
              variant_type: variant.variant_type,
              price: variant.display_price,
              image: product.cover_url,
              is_digital: variant.is_digital,
              available_stock: variant.available_stock,
              currency_symbol: currencySymbol,
              weight_kg: variant.weight_kg ?? null,
              quantity: clampQuantity(item.quantity + requestedQuantity, variant.is_digital, variant.available_stock),
            }
            : item
        );
      }

      return [
        {
          key,
          product_id: product.product_id,
          variant_id: variant.variant_id,
          title: product.title,
          variant_name: variant.variant_name,
          variant_type: variant.variant_type,
          price: variant.display_price,
          quantity: requestedQuantity,
          image: product.cover_url,
          is_digital: variant.is_digital,
          available_stock: variant.available_stock,
          currency_symbol: currencySymbol,
          weight_kg: variant.weight_kg ?? null,
        },
        ...prev,
      ];
    });
  };

  const updateQuantity = (key: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? { ...item, quantity: clampQuantity(quantity, item.is_digital, item.available_stock) }
          : item
      )
    );
  };

  const removeFromCart = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const clearCart = () => setItems([]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce(
      (acc, item) => acc + item.quantity * item.price,
      0
    );
    const hasPhysicalItems = items.some((item) => !item.is_digital);
    const isEgypt = !selectedCountry || selectedCountry.code === 'EG';
    const freeShippingThreshold = isEgypt ? freeShippingThresholdValue : 0;
    const qualifiesForFreeShipping = isEgypt && freeShippingThresholdValue > 0 && subtotal >= freeShippingThresholdValue;
    const shipping = hasPhysicalItems && !qualifiesForFreeShipping ? shippingFlatRate : 0;
    const remainingForFreeShipping = isEgypt ? Math.max(0, freeShippingThresholdValue - subtotal) : 0;
    const total = subtotal + shipping;
    const currencySymbol = items[0]?.currency_symbol ?? 'ج.م';
    // Same per-item 0.3kg fallback the server uses (create-storefront-order /
    // initiate-paymob-payment) when a variant has no recorded weight — so
    // the real governorate-rate lookup (useShippingRate) queries the exact
    // weight the server will independently recompute and actually charge.
    const cartWeightKg = items.reduce(
      (acc, item) => (item.is_digital ? acc : acc + (item.weight_kg || 0.3) * item.quantity),
      0
    );

    return {
      items,
      count: items.reduce((acc, item) => acc + item.quantity, 0),
      subtotal,
      shipping,
      total,
      currencySymbol,
      freeShippingThreshold,
      remainingForFreeShipping,
      cartWeightKg,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      unavailableRemoved,
      dismissUnavailableNotice,
    };
  }, [items, selectedCountry, shippingFlatRate, freeShippingThresholdValue, unavailableRemoved]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}
