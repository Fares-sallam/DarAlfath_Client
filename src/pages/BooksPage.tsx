import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import BooksFilterBar from '@/components/BooksFilterBar';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import { applyFilters, authorOptions, parseFilters, priceBounds } from '@/lib/catalogFilters';
import {
  useAvailableProductIds,
  useCategories,
  useProducts,
  useProductExtraCategorySlugs,
  useSeries,
  useSeriesProductIds,
} from '@/hooks/useStorefront';
import { siteOrigin, useSeo } from '@/hooks/useSeo';
import { booksListSeo } from '@/lib/seo';

/** The filters that go in the address, besides the search words and the order. */
const FILTER_KEYS = ['category', 'series', 'author', 'type', 'min', 'max', 'available', 'sale'];

export default function BooksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: allSeries = [] } = useSeries();
  const { data: extraCategorySlugs } = useProductExtraCategorySlugs();
  const { data: availableIds } = useAvailableProductIds();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === filters.category) ?? null,
    [categories, filters.category]
  );

  const selectedSeries = useMemo(
    () => allSeries.find((item) => item.id === filters.series) ?? null,
    [allSeries, filters.series]
  );

  // Title, description and preview for this view of the catalog (a category and a series have their own);
  // a search, an order or any other filter makes it one that doesn't belong in search results.
  useSeo(
    booksListSeo(siteOrigin(), {
      categorySlug: filters.category || null,
      categoryName: selectedCategory?.name ?? null,
      seriesName: selectedSeries?.name ?? null,
      seriesId: filters.series || null,
      searched: Boolean(
        filters.q.trim() || filters.type || filters.author || searchParams.get('sort') ||
          filters.min != null || filters.max != null || filters.availableOnly || filters.saleOnly,
      ),
    }),
  );

  // The public catalog rows products come from don't carry series info
  // themselves (see useSeries in useStorefront.ts) — a separate lookup of
  // just this series' product ids, used to filter below.
  const { data: seriesProductIds, isLoading: loadingSeriesIds } = useSeriesProductIds(filters.series || null);

  const productTypes = useMemo(() => {
    const values = new Set<string>();
    products.forEach((product) => {
      if (product.type) values.add(product.type);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  const options = useMemo(
    () => ({
      categories: categories.map((item) => ({ value: item.id, label: item.name })),
      series: allSeries.map((item) => ({ value: item.id, label: item.name })),
      authors: authorOptions(products),
      types: productTypes,
      bounds: priceBounds(products),
      currencySymbol: products[0]?.currency_symbol ?? 'ج.م',
      canFilterAvailability: availableIds != null,
    }),
    [categories, allSeries, products, productTypes, availableIds],
  );

  /** `replace`: a field being typed in shouldn't leave a history entry for every keystroke. */
  const setParams = (changes: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value.trim()) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    FILTER_KEYS.forEach((key) => next.delete(key));
    setSearchParams(next);
  };

  const filtered = useMemo(
    () =>
      applyFilters(products, filters, {
        extraCategorySlugs,
        seriesProductIds: filters.series && seriesProductIds ? new Set(seriesProductIds) : null,
        availableIds,
      }),
    [products, filters, extraCategorySlugs, seriesProductIds, availableIds],
  );

  const filtersOn = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <div className="page-sections">
      <BooksFilterBar filters={filters} options={options} setParams={setParams} clearFilters={clearFilters} />

      {isLoading || (filters.series && loadingSeriesIds) ? (
        <section className="page-card page-card--loading" />
      ) : null}

      {!isLoading && !(filters.series && loadingSeriesIds) ? (
        <section>
          <SectionHeader
            as="h1"
            title={selectedSeries?.name || selectedCategory?.name || 'كل الكتب'}
            subtitle={`${filtered.length} كتاب مطابق للعرض الحالي`}
          />

          <div className="books-grid books-grid--catalog">
            {filtered.map((product, i) => (
              <ProductCard key={product.product_id} product={product} compact index={i} />
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && !(filters.series && loadingSeriesIds) && filtered.length === 0 ? (
        <section className="page-card">
          <div className="empty-state">
            <h3>لا توجد نتائج</h3>
            <p>{filtersOn ? 'خفّف الفلاتر أو جرّب كلمة بحث أخرى.' : 'جرّب كلمة بحث أخرى.'}</p>
            {filtersOn && (
              <button type="button" className="ghost-button" onClick={clearFilters}>
                مسح الفلاتر
              </button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
