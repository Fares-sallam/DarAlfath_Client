import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useCountry } from '@/contexts/CountryContext';
import { useAuth } from '@/contexts/AuthContext';
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
  default_shipping_cost: 45,
  free_shipping_threshold: 499,
  default_shipping_company_id: null,
  facebook_url: null,
  instagram_url: null,
  whatsapp_url: null,
  youtube_url: null,
  website_url: null,
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
  old_price?: number | string | null;
  discount_percent?: number | string | null;
  max_discount_pct?: number | string | null;
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
  weight_kg?: number | string | null;
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

type ReviewStats = { avg_rating: number; reviews_count: number };

function normalizeProduct(row: PublicCatalogRow, stats?: ReviewStats): ProductItem {
  const productId = row.product_id;
  const startingPrice = toNumber(row.starting_price ?? row.min_price);
  const minPrice = toNumber(row.min_price ?? startingPrice);
  const maxPrice = toNumber(row.max_price ?? startingPrice);
  const oldPrice = row.old_price != null ? toNumber(row.old_price) : null;
  const compareAtPrice = oldPrice && oldPrice > minPrice ? oldPrice : null;
  const discountPct = row.max_discount_pct != null ? toNumber(row.max_discount_pct) : 0;
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
    compare_at_price: compareAtPrice,
    discount_percent: discountPct > 0 ? discountPct : null,
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
    // Real customer reviews (product_review_stats) — null/0 for a
    // product nobody has reviewed yet. No fabricated placeholder value:
    // the UI is responsible for a proper "no reviews yet" state.
    rating: stats?.avg_rating ?? null,
    reviews_count: stats?.reviews_count ?? 0,
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
    weight_kg: row.weight_kg == null ? null : toNumber(row.weight_kg),
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
          .select('store_name, store_description, store_email, store_phone, store_address, seo_title, seo_description, seo_keywords, default_shipping_cost, free_shipping_threshold, default_shipping_company_id, facebook_url, instagram_url, whatsapp_url, youtube_url, website_url')
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

/** The real governorate+weight shipping quote — mirrors, field for field,
 *  the same lookup create-storefront-order and initiate-paymob-payment run
 *  server-side right before charging the customer (see the comment there:
 *  "لا نثق بقيمة العميل"). Checkout was showing a flat estimate the whole
 *  time regardless of which governorate the customer picked, then charging
 *  a different, governorate-real amount at payment time — this hook is
 *  what lets the displayed number match the charged one. Returns null
 *  (not 0) when no rate row covers this exact combination, so the caller
 *  can fall back to the flat rate exactly like the server does — this is
 *  a display quote only, never trusted for the actual charge either. */
export function useShippingRate(
  companyId: string | null | undefined,
  governorate: string | null | undefined,
  weightKg: number
) {
  const gov = (governorate ?? '').trim();

  return useQuery({
    queryKey: ['shipping-rate', companyId ?? 'none', gov || 'none', weightKg],
    enabled: Boolean(isSupabaseConfigured && companyId && gov),
    queryFn: async (): Promise<number | null> => {
      if (!companyId || !gov) return null;
      const { data, error } = await supabase
        .from('shipping_rates')
        .select('price')
        .eq('shipping_company_id', companyId)
        .eq('governorate', gov)
        .eq('is_active', true)
        .lte('weight_from_kg', weightKg)
        .or(`weight_to_kg.is.null,weight_to_kg.gte.${weightKg}`)
        .order('weight_from_kg', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data || data.price == null) return null;
      return Number(data.price);
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

        const [{ data, error }, { data: statsRows }] = await Promise.all([
          query,
          supabase.from('product_review_stats').select('product_id, reviews_count, avg_rating'),
        ]);
        if (error || !data) return [];

        const statsMap = new Map<string, ReviewStats>(
          (statsRows ?? []).map((s: { product_id: string; reviews_count: number; avg_rating: number }) => [
            s.product_id,
            { avg_rating: s.avg_rating, reviews_count: s.reviews_count },
          ])
        );

        return (data as PublicCatalogRow[]).map((row) => normalizeProduct(row, statsMap.get(row.product_id)));
      } catch {
        return [];
      }
    },
  });
}

/* ── Additional categories a product also shows under ────────────────
 * Beyond each product's single required category_id (already covered
 * by products_public_catalog's category_slug), a book can be tagged
 * into extra categories too — same additive shape as product_series.
 * product_categories has its own public SELECT policy, so this reads
 * it directly rather than needing a view. */
export function useProductExtraCategorySlugs() {
  return useQuery({
    queryKey: ['product-extra-category-slugs'],
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      if (!isSupabaseConfigured) return new Map();

      const { data, error } = await supabase
        .from('product_categories')
        .select('product_id, categories(slug)');

      if (error || !data) return new Map();

      const map = new Map<string, Set<string>>();
      // The untyped supabase client (no generated Database type) infers
      // every embedded relation as an array by default, regardless of
      // actual FK cardinality — but product_categories.category_id is a
      // plain belongs-to FK, so PostgREST embeds `categories` as a single
      // object per row at runtime. `as unknown as` bridges that gap (TS's
      // own suggested escape hatch for a type it can't verify).
      for (const row of data as unknown as { product_id: string; categories: { slug: string | null } | null }[]) {
        const slug = row.categories?.slug;
        if (!slug) continue;
        if (!map.has(row.product_id)) map.set(row.product_id, new Set());
        map.get(row.product_id)!.add(slug);
      }
      return map;
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

/** Real book_series rows (what the dashboard's "إدارة السلاسل" manages) —
 *  not to be confused with the category-derived groupings below. RLS
 *  (series_anon_select) already scopes this to is_active=true for anon. */
export function useSeries() {
  return useQuery({
    queryKey: ['book-series'],
    queryFn: async (): Promise<SeriesItem[]> => {
      if (!isSupabaseConfigured) return [];

      const { data, error } = await supabase
        .from('book_series')
        .select('id, name, description, cover_url, sort_order, product_series(product_id)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as { id: string; name: string; description: string | null; cover_url: string | null; product_series: { product_id: string }[] }[])
        .map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          cover_url: row.cover_url,
          products_count: (row.product_series ?? []).length,
        }));
    },
  });
}

/** Product ids belonging to one series — used to filter the books page
 *  when arriving via a series/department card, since the public catalog
 *  view products come from doesn't carry series info on the row itself. */
export function useSeriesProductIds(seriesId: string | null) {
  return useQuery({
    queryKey: ['series-product-ids', seriesId],
    enabled: !!seriesId && isSupabaseConfigured,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('product_series')
        .select('product_id')
        .eq('series_id', seriesId!);

      if (error) throw error;
      return ((data ?? []) as { product_id: string }[]).map((row) => row.product_id);
    },
  });
}

export function useProductDetails(productId?: string) {
  const productsQuery = useProducts();
  const product = useMemo(
    () => (productsQuery.data ?? []).find((item) => item.product_id === productId) ?? null,
    [productsQuery.data, productId]
  );

  return { ...productsQuery, data: product };
}

/* ── Product reviews (real, verified-purchase-gated) ───────────────────
 * Replaces the old fake rating/reviews_count (see normalizeProduct
 * above). A review can only be inserted for a product the reviewing
 * customer actually received — enforced server-side by product_reviews'
 * own RLS policy (order.status = تم التوصيل), one review per customer
 * per product (unique constraint; a resubmit is an update, not a dupe). */
export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  reviewer_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export function useProductReviews(productId?: string) {
  return useQuery({
    queryKey: ['product-reviews', productId ?? 'missing'],
    enabled: Boolean(productId),
    queryFn: async (): Promise<ProductReview[]> => {
      if (!isSupabaseConfigured || !productId) return [];
      const { data, error } = await supabase
        .from('product_reviews')
        .select('id, product_id, user_id, reviewer_name, rating, comment, created_at, updated_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error || !data) return [];
      return data as ProductReview[];
    },
  });
}

/** Whether the signed-in customer has a delivered order containing this
 *  product — gates showing the "write a review" form so the UI doesn't
 *  invite a submission that the server-side RLS check would just reject.
 *  Mirrors that check exactly (same status string, same join). */
export function useCanReviewProduct(productId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['can-review-product', productId ?? 'missing', user?.id ?? 'anon'],
    enabled: Boolean(productId && user),
    queryFn: async (): Promise<boolean> => {
      if (!isSupabaseConfigured || !productId || !user) return false;
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_items!inner(product_id)')
        .eq('user_id', user.id)
        .eq('status', 'تم التوصيل')
        .eq('order_items.product_id', productId)
        .limit(1);
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
  });
}

export interface SubmitReviewInput {
  productId: string;
  userId: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
}

/** Insert or update — a customer can only ever have one review per
 *  product (unique(product_id, user_id)), so re-submitting after already
 *  reviewing edits the existing row rather than erroring. */
export function useSubmitProductReview() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitReviewInput) => {
      const { error } = await supabase.from('product_reviews').upsert(
        {
          product_id: input.productId,
          user_id: input.userId,
          reviewer_name: input.reviewerName.trim() || 'قارئ',
          rating: input.rating,
          comment: input.comment?.trim() || null,
        },
        { onConflict: 'product_id,user_id' }
      );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['product-reviews', vars.productId] });
      qc.invalidateQueries({ queryKey: ['products-public-catalog'] });
    },
  });
}

export function useDeleteProductReview() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; productId: string }) => {
      const { error } = await supabase.from('product_reviews').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['product-reviews', vars.productId] });
      qc.invalidateQueries({ queryKey: ['products-public-catalog'] });
    },
  });
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

export function useProductImageGallery(productId?: string) {
  return useQuery({
    queryKey: ['product-gallery', productId ?? 'missing'],
    enabled: Boolean(productId),
    queryFn: async (): Promise<string[]> => {
      if (!isSupabaseConfigured || !productId) return [];
      try {
        const { data, error } = await supabase
          .from('product_images')
          .select('url, is_primary, sort_order')
          .eq('product_id', productId)
          .order('is_primary', { ascending: false })
          .order('sort_order', { ascending: true });

        if (error || !data) return [];
        return (data as { url: string }[]).map((img) => img.url).filter(Boolean);
      } catch {
        return [];
      }
    },
  });
}

export type PaymentMethodItem = {
  id: string;
  provider: string;
  method_name: string;
};

// apple_iap / google_iap are native-app-only checkout methods (they invoke
// StoreKit / Google Play Billing's own purchase sheet) — structurally
// impossible to complete from a website, no matter how "active" the row
// is. They exist in payment_methods for the mobile app's in-app-purchase
// flow (still unbuilt — see IAP planning notes), not the website. Excluded
// at the source so the website checkout can never offer a payment option
// that can't work there.
const WEB_UNSUPPORTED_PROVIDERS = ['apple_iap', 'google_iap'];

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
          .not('provider', 'in', `(${WEB_UNSUPPORTED_PROVIDERS.join(',')})`)
          .order('method_name');
        if (error || !data) return [];
        return data as PaymentMethodItem[];
      } catch {
        return [];
      }
    },
  });
}

/* ── Homepage hero showcase ──────────────────────────────────────────
 * Admin-managed slides (home_hero_slides table), independent of the
 * products table — the hero can be curated before the catalog is full.
 * Only active rows are visible: RLS already filters this server-side,
 * so no client-side is_active check is needed here. */
export interface HeroSlideItem {
  id: string;
  image_url: string;
  /** Optional phone-shaped variant of the same slide — the storefront
   *  swaps to it under ~640px via a <picture> element. Falls back to
   *  image_url on every screen when the admin hasn't uploaded one. */
  image_url_mobile: string | null;
  /** Optional dark-mode variant of image_url — design can differ enough
   *  between themes that one image can't serve both. Falls back to
   *  image_url when the admin hasn't uploaded one (see HeroShowcase). */
  image_url_dark: string | null;
  /** Optional dark-mode variant of image_url_mobile. Falls back to
   *  image_url_dark, then image_url_mobile, when not set. */
  image_url_mobile_dark: string | null;
  title: string | null;
  link_url: string | null;
  sort_order: number;
}

export function useHomeHeroSlides() {
  return useQuery({
    queryKey: ['home-hero-slides'],
    queryFn: async (): Promise<HeroSlideItem[]> => {
      if (!isSupabaseConfigured) return [];

      const { data, error } = await supabase
        .from('home_hero_slides')
        .select('id, image_url, image_url_mobile, image_url_dark, image_url_mobile_dark, title, link_url, sort_order')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as HeroSlideItem[];
    },
  });
}

/* ── Homepage "من الدار" intro videos ─────────────────────────────────
 * Admin-managed (intro_videos table) — used to be 3 hardcoded entries in
 * src/data/introVideos.ts, all pointing at the same Rickroll placeholder
 * link nobody ever replaced. Only active rows are visible: RLS already
 * filters this server-side, so no client-side is_active check needed. */
export interface VideoItemRow {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  duration: string | null;
  sort_order: number;
}

export function useIntroVideos() {
  return useQuery({
    queryKey: ['intro-videos'],
    queryFn: async (): Promise<VideoItemRow[]> => {
      if (!isSupabaseConfigured) return [];

      const { data, error } = await supabase
        .from('intro_videos')
        .select('id, title, description, youtube_url, duration, sort_order')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as VideoItemRow[];
    },
  });
}
