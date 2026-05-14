import type { CartItem } from '@/contexts/CartContext';
import { supabase } from '@/lib/supabase';
import type { CountryItem } from '@/types/store';

export type PaymentMethod = 'cod' | 'bank' | 'wallet';

export type StorefrontOrderItem = {
  id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  price_per_item: number;
  discount_per_item: number;
  is_digital: boolean;
  download_url?: string | null;
  products?: {
    id: string;
    title: string;
    author?: string | null;
    cover_url?: string | null;
    type?: string | null;
  } | null;
  product_variants?: {
    id: string;
    variant_name?: string | null;
  } | null;
};

export type StorefrontOrder = {
  id: string;
  user_id?: string | null;
  country_id?: string | null;
  status: string;
  total_price: number;
  shipping_cost: number;
  discount_amount: number;
  payment_status: string;
  tracking_number?: string | null;
  shipping_company_id?: string | null;
  shipping_address?: {
    name?: string;
    email?: string;
    phone?: string;
    governorate?: string;
    city?: string;
    country?: string;
    street?: string;
    notes?: string;
  } | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  countries?: { name?: string | null; currency_symbol?: string | null } | null;
  payment_methods?: { method_name?: string | null; provider?: string | null } | null;
  shipping_companies?: { company_name?: string | null; logo_url?: string | null } | null;
  order_items?: StorefrontOrderItem[];
};

export type StorefrontOrderCustomer = {
  fullName: string;
  email: string;
  phone: string;
  governorate: string;
  city: string;
  address: string;
  notes?: string;
};

export type StorefrontOrderInput = {
  customer: StorefrontOrderCustomer;
  paymentMethod: PaymentMethod;
  paymentMethodId: string | null;
  country: CountryItem | null;
  items: CartItem[];
  shipping: number;
  /** 'online' = Paymob: لا يُخصم المخزون إلا بعد تأكيد الدفع عبر Webhook */
  paymentType?: 'cod' | 'online';
};

export function getPaymentMethodLabel(method: PaymentMethod) {
  if (method === 'bank') return 'تحويل بنكي';
  if (method === 'wallet') return 'محفظة إلكترونية';
  return 'الدفع عند الاستلام';
}

export function formatStorefrontOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export async function createStorefrontOrder(input: StorefrontOrderInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const payload = {
    customer: {
      fullName: input.customer.fullName.trim(),
      email: input.customer.email.trim(),
      phone: input.customer.phone.trim(),
      governorate: input.customer.governorate.trim(),
      city: input.customer.city.trim(),
      address: input.customer.address.trim(),
      notes: input.customer.notes?.trim() || '',
    },
    paymentMethod: input.paymentMethod,
    paymentMethodId: input.paymentMethodId,
    paymentType: input.paymentType ?? 'cod',
    country: input.country
      ? {
        id: input.country.id,
        code: input.country.code,
        name: input.country.name,
        currencySymbol: input.country.currency_symbol,
      }
      : null,
    shipping: input.shipping,
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
  };

  const { data, error } = await supabase.functions.invoke('create-storefront-order', {
    body: payload,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    let responseError = '';

    if (context) {
      try {
        const details = await context.clone().json();
        if (typeof details?.error === 'string' && details.error.trim()) {
          responseError = details.error;
        }
      } catch {
        // Fall back to the generic message below when Supabase returns a non-JSON error body.
      }
    }

    if (responseError) {
      throw new Error(responseError);
    }

    if (error.message?.includes('Failed to send')) {
      throw new Error('تعذر الاتصال بدالة تسجيل الطلب في Supabase. تأكد من نشر create-storefront-order.');
    }

    throw new Error(error.message || 'تعذر إنشاء الطلب في قاعدة البيانات.');
  }

  if (!data?.order?.id) {
    throw new Error('لم ترجع قاعدة البيانات رقم الطلب.');
  }

  return data.order as StorefrontOrder;
}

export async function fetchCustomerOrders(userId?: string, email?: string) {
  if (!userId && !email) return [];

  // Base query — no download_url to avoid errors if the column doesn't exist yet
  const baseSelect = `
    id,
    user_id,
    country_id,
    status,
    total_price,
    shipping_cost,
    discount_amount,
    payment_status,
    tracking_number,
    shipping_address,
    notes,
    created_at,
    updated_at,
    countries(name, currency_symbol),
    payment_methods(method_name, provider),
    shipping_companies(company_name, logo_url),
    order_items(
      id,
      product_id,
      variant_id,
      quantity,
      price_per_item,
      discount_per_item,
      is_digital,
      products(id, title, author, cover_url, type),
      product_variants(id, variant_name)
    )
  `;

  // Strategy: query by user_id first (most reliable with RLS).
  // If the user also has an email, run a second query for guest orders
  // placed before they had an account, then merge.
  const results: StorefrontOrder[] = [];

  if (userId) {
    const { data, error } = await supabase
      .from('orders')
      .select(baseSelect)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (data) results.push(...(data as unknown as StorefrontOrder[]));
  }

  if (email) {
    // Guest orders: placed with this email but no user_id link
    const { data, error } = await supabase
      .from('orders')
      .select(baseSelect)
      .is('user_id', null)
      .filter('shipping_address->>email', 'eq', email)
      .order('created_at', { ascending: false });

    // Ignore RLS errors for email fallback (policy may not cover it)
    if (!error && data) {
      results.push(...(data as unknown as StorefrontOrder[]));
    }
  }

  // Deduplicate by id and sort newest first
  const seen = new Set<string>();
  const merged = results.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return merged;
}
