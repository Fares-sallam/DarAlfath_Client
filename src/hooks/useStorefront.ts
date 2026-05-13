import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getPseudoRating } from '@/lib/utils';
import { useCountry } from '@/contexts/CountryContext';
import type { CategoryItem, ProductItem, ProductVariantItem, SeriesItem, StoreSettings } from '@/types/store';

const fallbackSettings: StoreSettings = {
  store_name: 'دار الفتح للنشر والتوزيع',
  store_description: 'منصة عربية أنيقة تجمع بين أصالة المحتوى وهدوء التجربة وفخامة العرض.',
  store_email: 'info@example.com',
  store_phone: '+20 100 000 0000',
  store_address: 'القاهرة - مصر',
  seo_title: 'دار الفتح للنشر والتوزيع',
  seo_description: 'منصة عربية أنيقة تجمع بين أصالة المحتوى وهدوء التجربة وفخامة العرض.',
  seo_keywords: '',
};

type PublicCatalogRow = {
  product_id: string;
  title?: string | null;
  author?: string | null;
  description?: string | null;
  main_image_url?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  type?: string | null;
  country_code?: string | null;
  currency?: string | null;
  currency_symbol?: string | null;
  min_price?: number | string | null;
  max_price?: number | string | null;
  starting_price?: number | string | null;
  variant_count?: number | string | null;
  images?: string[] | string | null;
};

type PublicVariantRow = {
  variant_id: string;
  product_id: string;
  title?: string | null;
  variant_name?: string | null;
  variant_type?: string | null;
  country_code?: string | null;
  currency?: string | null;
  currency_symbol?: string | null;
  price?: number | string | null;
  sale_price?: number | string | null;
  base_price?: number | string | null;
  is_digital?: boolean | null;
  is_available?: boolean | null;
  available_stock?: number | string | null;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
}

function parseImages(value: PublicCatalogRow['images'], mainImage?: string | null) {
  const fromValue = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? safeParseImages(value)
      : [];

  const images = fromValue.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (mainImage && !images.includes(mainImage)) {
    return [mainImage, ...images];
  }
  return images;
}

function safeParseImages(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value ? [value] : [];
  }
}

function normalizeProduct(row: PublicCatalogRow): ProductItem {
  const productId = row.product_id;
  const startingPrice = toNumber(row.starting_price ?? row.min_price);
  const minPrice = toNumber(row.min_price ?? startingPrice);
  const maxPrice = toNumber(row.max_price ?? startingPrice);
  const categorySlug = row.category_slug ?? null;
  const categoryName = row.category_name ?? 'غير مصنف';

  return {
    id: productId,
    product_id: productId,
    title: row.title || 'كتاب بدون عنوان',
    author: row.author || 'دار الفتح',
    description: row.description || null,
    cover_url: row.main_image_url || null,
    main_image_url: row.main_image_url || null,
    images: parseImages(row.images, row.main_image_url),
    type: row.type || 'كتاب',
    base_price: startingPrice,
    sale_price: null,
    display_price: startingPrice,
    min_price: minPrice,
    max_price: maxPrice,
    starting_price: startingPrice,
    compare_at_price: null,
    category_id: categorySlug,
    category_name: categoryName,
    category_slug: categorySlug,
    category: categorySlug ? { id: categorySlug, name: categoryName, slug: categorySlug } : null,
    series_id: null,
    series: null,
    country_code: row.country_code ?? null,
    currency: row.currency ?? null,
    currency_symbol: row.currency_symbol || 'ج.م',
    country_id: row.country_code ?? null,
    rating: getPseudoRating(productId),
    reviews_count: 60 + (productId.length % 90),
    variant_count: Math.max(0, Math.floor(toNumber(row.variant_count))),
    variants: [],
  };
}

function normalizeVariant(row: PublicVariantRow): ProductVariantItem {
  const basePrice = toNumber(row.base_price ?? row.price);
  const salePrice = row.sale_price == null ? null : toNumber(row.sale_price);
  const displayPrice = salePrice ?? toNumber(row.price ?? row.base_price);
  const isDigital = Boolean(row.is_digital);
  const stock = row.available_stock == null ? null : Math.max(0, Math.floor(toNumber(row.available_stock)));
  const isAvailable = isDigital ? Boolean(row.is_available ?? true) : Boolean(row.is_available) && Number(stock ?? 0) > 0;
  const variantName = row.variant_name || row.title || row.variant_type || 'نسخة';
  const variantType = row.variant_type || (isDigital ? 'رقمي' : 'ورقي');

  return {
    id: row.variant_id,
    variant_id: row.variant_id,
    product_id: row.product_id,
    title: row.title || variantName,
    variant_name: variantName,
    variant_type: variantType,
    format: variantType,
    sku: null,
    price: displayPrice,
    base_price: basePrice,
    sale_price: salePrice,
    display_price: displayPrice,
    compare_at_price: salePrice && basePrice > salePrice ? basePrice : null,
    is_default: false,
    is_digital: isDigital,
    is_available: isAvailable,
    available_stock: isDigital ? null : stock,
    country_code: row.country_code ?? null,
    currency: row.currency ?? null,
    currency_symbol: row.currency_symbol || 'ج.م',
    availability_text: isDigital
      ? 'متاح فورًا'
      : isAvailable
        ? `متوفر ${stock ?? 0} نسخة`
        : 'غير متوفر',
  };
}

export function formatMoney(value: number, currencySymbol: string) {
  return `${Number(value || 0).toLocaleString('ar-EG')} ${currencySymbol}`;
}

export function formatCatalogPrice(product: ProductItem) {
  if (product.min_price !== product.max_price) {
    return `من ${formatMoney(product.min_price, product.currency_symbol)} إلى ${formatMoney(product.max_price, product.currency_symbol)}`;
  }
  return `يبدأ من ${formatMoney(product.starting_price, product.currency_symbol)}`;
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ['store-settings'],
    queryFn: async (): Promise<StoreSettings> => {
      if (!isSupabaseConfigured) return fallbackSettings;

      try {
        const { data, error } = await supabase
          .from('store_settings')
          .select('store_name, store_description, store_email, store_phone, store_address, seo_title, seo_description, seo_keywords')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !data) return fallbackSettings;
        return { ...fallbackSettings, ...data };
      } catch {
        return fallbackSettings;
      }
    },
  });
}

export function useProducts() {
  const { selectedCountry } = useCountry();
  const countryCode = selectedCountry?.code || undefined;

  return useQuery({
    queryKey: ['products-public-catalog', countryCode ?? 'all'],
    queryFn: async (): Promise<ProductItem[]> => {
      if (!isSupabaseConfigured) return [];

      try {
        let query = supabase
          .from('products_public_catalog')
          .select('*')
          .order('title', { ascending: true });

        if (countryCode) {
          query = query.eq('country_code', countryCode);
        }

        const { data, error } = await query;
        if (error || !data) return [];

        return (data as PublicCatalogRow[]).map(normalizeProduct);
      } catch {
        return [];
      }
    },
  });
}

export function useCategories() {
  const productsQuery = useProducts();

  const categories = useMemo(() => {
    const map = new Map<string, CategoryItem>();
    for (const product of productsQuery.data ?? []) {
      if (!product.category_slug || !product.category_name) continue;
      map.set(product.category_slug, {
        id: product.category_slug,
        name: product.category_name,
        slug: product.category_slug,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [productsQuery.data]);

  return { ...productsQuery, data: categories };
}

export function useSeries() {
  const productsQuery = useProducts();

  const series = useMemo(() => {
    const map = new Map<string, SeriesItem>();
    for (const product of productsQuery.data ?? []) {
      if (!product.category_slug || !product.category_name) continue;
      const current = map.get(product.category_slug);
      map.set(product.category_slug, {
        id: product.category_slug,
        name: product.category_name,
        slug: product.category_slug,
        products_count: (current?.products_count ?? 0) + 1,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [productsQuery.data]);

  return { ...productsQuery, data: series };
}

export function useProductDetails(productId?: string) {
  const productsQuery = useProducts();
  const product = useMemo(
    () => (productsQuery.data ?? []).find((item) => item.product_id === productId) ?? null,
    [productsQuery.data, productId]
  );

  return { ...productsQuery, data: product };
}

export function useProductVariants(productId?: string) {
  const { selectedCountry } = useCountry();
  const countryCode = selectedCountry?.code || undefined;

  return useQuery({
    queryKey: ['product-variants-public', productId ?? 'missing', countryCode ?? 'all'],
    enabled: Boolean(productId),
    queryFn: async (): Promise<ProductVariantItem[]> => {
      if (!isSupabaseConfigured) return [];

      try {
        let query = supabase
          .from('product_variants_public')
          .select('*')
          .eq('product_id', productId);

        if (countryCode) {
          query = query.eq('country_code', countryCode);
        }

        const { data, error } = await query;
        if (error || !data) return [];

        return (data as PublicVariantRow[]).map(normalizeVariant);
      } catch {
        return [];
      }
    },
  });
}

export function useHomeCategorySections(limitPerCategory = 4) {
  const productsQuery = useProducts();

  const sections = useMemo(() => {
    const grouped = new Map<string, { category: CategoryItem; products: ProductItem[] }>();

    for (const product of productsQuery.data ?? []) {
      const id = product.category_slug || 'general';
      const category = product.category || { id, name: product.category_name || 'كتب مختارة', slug: id };
      const current = grouped.get(id) ?? { category, products: [] };
      current.products.push(product);
      grouped.set(id, current);
    }

    return Array.from(grouped.values()).map((entry) => ({
      ...entry,
      products: entry.products.slice(0, limitPerCategory),
    }));
  }, [productsQuery.data, limitPerCategory]);

  return { ...productsQuery, data: sections };
}

export function useHomeSeriesSections(limitPerSeries = 4) {
  const sectionsQuery = useHomeCategorySections(limitPerSeries);
  const sections = useMemo(
    () =>
      sectionsQuery.data.map((entry) => ({
        series: {
          id: entry.category.id,
          name: entry.category.name,
          slug: entry.category.slug,
          products_count: entry.products.length,
        } as SeriesItem,
        products: entry.products,
      })),
    [sectionsQuery.data]
  );

  return { ...sectionsQuery, data: sections };
}

export function useRelatedProducts(categorySlug?: string | null, excludedId?: string) {
  const productsQuery = useProducts();
  const related = useMemo(() => {
    const products = productsQuery.data ?? [];
    return products
      .filter((item) => item.product_id !== excludedId)
      .filter((item) => (categorySlug ? item.category_slug === categorySlug : true))
      .slice(0, 5);
  }, [productsQuery.data, categorySlug, excludedId]);

  return { ...productsQuery, data: related };
}

export function useWishlistProducts(ids: string[]) {
  const productsQuery = useProducts();
  const items = useMemo(() => {
    const products = productsQuery.data ?? [];
    return ids.map((id) => products.find((item) => item.product_id === id)).filter(Boolean) as ProductItem[];
  }, [ids, productsQuery.data]);

  return { ...productsQuery, data: items };
}

export type PaymentMethodItem = {
  id: string;
  provider: string;
  method_name: string;
};

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async (): Promise<PaymentMethodItem[]> => {
      if (!isSupabaseConfigured) return [];
      try {
        const { data, error } = await supabase
          .from('payment_methods')
          .select('id, provider, method_name')
          .eq('is_active', true)
          .order('method_name');
        if (error || !data) return [];
        return data as PaymentMethodItem[];
      } catch {
        return [];
      }
    },
  });
}
