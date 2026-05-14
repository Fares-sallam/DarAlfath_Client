export interface StoreSettings {
  store_name: string;
  store_description: string;
  store_email: string;
  store_phone: string;
  store_address: string;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
}

export interface CountryItem {
  id: string;
  name: string;
  code: string;
  currency: string;
  currency_symbol: string;
  is_active?: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug?: string | null;
}

export interface SeriesItem {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  cover_url?: string | null;
  products_count?: number;
}

export interface ProductVariantItem {
  id: string;
  variant_id: string;
  product_id: string;
  title: string;
  variant_name: string;
  variant_type: string;
  format: string;
  sku?: string | null;
  price: number;
  base_price?: number | null;
  sale_price?: number | null;
  display_price: number;
  compare_at_price?: number | null;
  is_default?: boolean;
  is_digital: boolean;
  is_available: boolean;
  available_stock?: number | null;
  country_code?: string | null;
  currency?: string | null;
  currency_symbol: string;
  availability_text?: string;
}

export interface ProductItem {
  id: string;
  product_id: string;
  title: string;
  author: string;
  description?: string | null;
  cover_url?: string | null;
  main_image_url?: string | null;
  images?: string[];
  type: string;
  base_price: number;
  sale_price?: number | null;
  display_price: number;
  min_price: number;
  max_price: number;
  starting_price: number;
  compare_at_price?: number | null;
  discount_percent?: number | null;
  category_id?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  category?: CategoryItem | null;
  series_id?: string | null;
  series?: SeriesItem | null;
  country_code?: string | null;
  currency?: string | null;
  currency_symbol: string;
  country_id?: string | null;
  rating: number;
  reviews_count: number;
  variant_count: number;
  variants: ProductVariantItem[];
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  youtubeUrl: string;
  duration: string;
}

export interface PolicySection {
  id: string;
  title: string;
  description: string;
  points: string[];
}
