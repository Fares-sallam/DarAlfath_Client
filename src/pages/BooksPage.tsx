import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import { OrnamentDivider } from '@/components/Ornament';
import { useCategories, useProducts, useSeries, useSeriesProductIds } from '@/hooks/useStorefront';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function BooksPage() {
  usePageTitle('الكتب');
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: allSeries = [] } = useSeries();

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const type = searchParams.get('type') ?? '';
  const sort = searchParams.get('sort') ?? 'title';
  const seriesId = searchParams.get('series') ?? '';

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === category) ?? null,
    [categories, category]
  );

  const selectedSeries = useMemo(
    () => allSeries.find((item) => item.id === seriesId) ?? null,
    [allSeries, seriesId]
  );

  // The public catalog rows products come from don't carry series info
  // themselves (see useSeries in useStorefront.ts) — a separate lookup of
  // just this series' product ids, used to filter below.
  const { data: seriesProductIds, isLoading: loadingSeriesIds } = useSeriesProductIds(seriesId || null);

  const productTypes = useMemo(() => {
    const values = new Set<string>();
    products.forEach((product) => {
      if (product.type) values.add(product.type);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const filtered = useMemo(() => {
    let rows = [...products];

    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter((item) =>
        [
          item.title,
          item.author,
          item.description,
          item.category_name,
          item.type,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    }

    if (category) {
      rows = rows.filter((item) => item.category_slug === category);
    }

    if (seriesId) {
      const idSet = new Set(seriesProductIds ?? []);
      rows = rows.filter((item) => idSet.has(item.product_id));
    }

    if (type) {
      rows = rows.filter((item) => item.type === type);
    }

    switch (sort) {
      case 'price-asc':
        rows.sort((a, b) => a.starting_price - b.starting_price);
        break;
      case 'price-desc':
        rows.sort((a, b) => b.starting_price - a.starting_price);
        break;
      case 'rating':
        rows.sort((a, b) => b.rating - a.rating);
        break;
      default:
        rows.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
        break;
    }

    return rows;
  }, [products, q, category, seriesId, seriesProductIds, type, sort]);

  return (
    <div className="page-sections">
      <section className="catalog-hero">
        <div>
          <span className="page-kicker">الكتالوج العام</span>
          <h1>كل كتب دار الفتح في مكان واحد</h1>
          <p>
            هذه صفحة الكتب فقط: ابحث، صفِّ النتائج، وافتح صفحة أي كتاب لاختيار
            النسخة المناسبة قبل الإضافة إلى السلة.
          </p>
          <OrnamentDivider />
        </div>
      </section>

      <section className="filters-bar">
        <input
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="ابحث عن كتاب، مؤلف، أو تصنيف..."
        />

        <select
          value={category}
          onChange={(e) => setParam('category', e.target.value)}
        >
          <option value="">كل التصنيفات</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select value={type} onChange={(e) => setParam('type', e.target.value)}>
          <option value="">كل الأنواع</option>
          {productTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setParam('sort', e.target.value)}>
          <option value="title">ترتيب أبجدي</option>
          <option value="price-asc">السعر من الأقل</option>
          <option value="price-desc">السعر من الأعلى</option>
          <option value="rating">الأعلى تقييمًا</option>
        </select>
      </section>

      {isLoading || (seriesId && loadingSeriesIds) ? (
        <section className="page-card page-card--loading" />
      ) : null}

      {!isLoading && !(seriesId && loadingSeriesIds) ? (
        <section>
          <SectionHeader
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

      {!isLoading && !(seriesId && loadingSeriesIds) && filtered.length === 0 ? (
        <section className="page-card">
          <div className="empty-state">
            <h3>لا توجد نتائج</h3>
            <p>غيّر التصنيف أو جرّب كلمة بحث أخرى.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
