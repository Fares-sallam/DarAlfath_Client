import type { CartItem } from '@/contexts/CartContext';

export type PaymentMethod = 'cod' | 'bank';
export type ClientOrderStatus = 'received' | 'processing' | 'completed';

export interface ClientOrderCustomer {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  notes?: string;
}

export interface ClientOrderItem {
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
  currency_symbol: string;
}

export interface ClientOrder {
  id: string;
  createdAt: string;
  status: ClientOrderStatus;
  paymentMethod: PaymentMethod;
  customer: ClientOrderCustomer;
  items: ClientOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currencySymbol: string;
}

export interface DigitalDownloadEntry {
  orderId: string;
  createdAt: string;
  customerEmail: string;
  item: ClientOrderItem;
}

const STORAGE_KEY = 'daralfath_client_orders';
const MAX_STORED_ORDERS = 50;

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function toSafeNumber(value: unknown, fallback = 0) {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function createOrderId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();

  return `DF-${datePart}-${randomPart}`;
}

function normalizeOrderItem(value: unknown): ClientOrderItem | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const productId = isNonEmptyString(raw.product_id) ? raw.product_id : null;
  const variantId = isNonEmptyString(raw.variant_id) ? raw.variant_id : null;

  if (!productId || !variantId) return null;

  return {
    key: isNonEmptyString(raw.key) ? raw.key : `${productId}:${variantId}`,
    product_id: productId,
    variant_id: variantId,
    title: isNonEmptyString(raw.title) ? raw.title : 'منتج',
    variant_name: isNonEmptyString(raw.variant_name) ? raw.variant_name : 'نسخة',
    variant_type: isNonEmptyString(raw.variant_type) ? raw.variant_type : 'نسخة',
    price: Math.max(0, toSafeNumber(raw.price)),
    quantity: Math.max(1, Math.floor(toSafeNumber(raw.quantity, 1))),
    image: typeof raw.image === 'string' ? raw.image : null,
    is_digital: Boolean(raw.is_digital),
    currency_symbol: isNonEmptyString(raw.currency_symbol) ? raw.currency_symbol : 'ج.م',
  };
}

function normalizeOrder(value: unknown): ClientOrder | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const customer = raw.customer && typeof raw.customer === 'object'
    ? (raw.customer as Record<string, unknown>)
    : {};
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => normalizeOrderItem(item)).filter(Boolean) as ClientOrderItem[]
    : [];

  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.createdAt) || items.length === 0) {
    return null;
  }

  return {
    id: raw.id,
    createdAt: raw.createdAt,
    status: raw.status === 'processing' || raw.status === 'completed' ? raw.status : 'received',
    paymentMethod: raw.paymentMethod === 'bank' ? 'bank' : 'cod',
    customer: {
      fullName: isNonEmptyString(customer.fullName) ? customer.fullName : 'عميل دار الفتح',
      email: isNonEmptyString(customer.email) ? customer.email : '',
      phone: isNonEmptyString(customer.phone) ? customer.phone : '',
      city: isNonEmptyString(customer.city) ? customer.city : '',
      address: isNonEmptyString(customer.address) ? customer.address : '',
      notes: isNonEmptyString(customer.notes) ? customer.notes : '',
    },
    items,
    subtotal: Math.max(0, toSafeNumber(raw.subtotal)),
    shipping: Math.max(0, toSafeNumber(raw.shipping)),
    total: Math.max(0, toSafeNumber(raw.total)),
    currencySymbol: isNonEmptyString(raw.currencySymbol) ? raw.currencySymbol : items[0]?.currency_symbol ?? 'ج.م',
  };
}

function getStoredOrders() {
  if (!canUseStorage()) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    return parsed
      .map((item) => normalizeOrder(item))
      .filter(Boolean) as ClientOrder[];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function setStoredOrders(orders: ClientOrder[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.slice(0, MAX_STORED_ORDERS)));
}

export function getClientOrders() {
  return getStoredOrders().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function createClientOrder(input: {
  customer: ClientOrderCustomer;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currencySymbol: string;
}) {
  const order: ClientOrder = {
    id: createOrderId(),
    createdAt: new Date().toISOString(),
    status: 'received',
    paymentMethod: input.paymentMethod,
    customer: {
      ...input.customer,
      fullName: input.customer.fullName.trim(),
      email: input.customer.email.trim(),
      phone: input.customer.phone.trim(),
      city: input.customer.city.trim(),
      address: input.customer.address.trim(),
      notes: input.customer.notes?.trim(),
    },
    items: input.items.map((item) => ({
      key: item.key,
      product_id: item.product_id,
      variant_id: item.variant_id,
      title: item.title,
      variant_name: item.variant_name,
      variant_type: item.variant_type,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      is_digital: item.is_digital,
      currency_symbol: item.currency_symbol,
    })),
    subtotal: input.subtotal,
    shipping: input.shipping,
    total: input.total,
    currencySymbol: input.currencySymbol,
  };

  setStoredOrders([order, ...getStoredOrders()]);
  return order;
}

export function getDigitalDownloads(): DigitalDownloadEntry[] {
  return getClientOrders().flatMap((order) =>
    order.items
      .filter((item) => item.is_digital)
      .map((item) => ({
        orderId: order.id,
        createdAt: order.createdAt,
        customerEmail: order.customer.email,
        item,
      }))
  );
}

export function formatClientOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getPaymentMethodLabel(method: PaymentMethod) {
  return method === 'bank' ? 'تحويل بنكي' : 'الدفع عند الاستلام';
}
