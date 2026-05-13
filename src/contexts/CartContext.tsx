import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductItem, ProductVariantItem } from '@/types/store';
import { useCountry } from '@/contexts/CountryContext';

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
  addToCart: (product: ProductItem, variant: ProductVariantItem, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = 'daralfath_client_cart';
const SHIPPING_FLAT_RATE = 45;
const FREE_SHIPPING_THRESHOLD = 499;

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

  // Lazy initializer: reads localStorage synchronously on first render
  // so cart is populated before any effect can overwrite it with []
  const [items, setItems] = useState<CartItem[]>(loadCartFromStorage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

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
    const freeShippingThreshold = isEgypt ? FREE_SHIPPING_THRESHOLD : 0;
    const qualifiesForFreeShipping = isEgypt && subtotal >= FREE_SHIPPING_THRESHOLD;
    const shipping = hasPhysicalItems && !qualifiesForFreeShipping ? SHIPPING_FLAT_RATE : 0;
    const remainingForFreeShipping = isEgypt ? Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal) : 0;
    const total = subtotal + shipping;
    const currencySymbol = items[0]?.currency_symbol ?? 'ج.م';

    return {
      items,
      count: items.reduce((acc, item) => acc + item.quantity, 0),
      subtotal,
      shipping,
      total,
      currencySymbol,
      freeShippingThreshold,
      remainingForFreeShipping,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
    };
  }, [items, selectedCountry]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}
