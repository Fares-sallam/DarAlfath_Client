import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import BooksFilterBar from '@/components/BooksFilterBar';
import NodeHero, { hasNodeIntro } from '@/components/NodeHero';
import { useNodePagePreview } from '@/lib/displayPreview';
import NodeStrips from '@/components/NodeStrips';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import { applyFilters, authorOptions, parseFilters, priceBounds } from '@/lib/catalogFilters';
import { NODE_TYPE_LABELS } from '@/lib/catalogTree';
import { buildNodePage, productIdsUnder } from '@/lib/nodePage';
import { useCatalogNodes, useProductNodeLinks } from '@/hooks/useCatalogTree';
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
const FILTER_KEYS = ['category', 'series', 'node', 'author', 'type', 'min', 'max', 'available', 'sale'];

export default function BooksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: allSeries = [] } = useSeries();
  const { data: extraCategorySlugs } = useProductExtraCategorySlugs();
  const { data: availableIds } = useAvailableProductIds();
  const { data: nodes = [], isLoading: loadingNodes } = useCatalogNodes();
  const { data: nodeLinks = [], isLoading: loadingLinks } = useProductNodeLinks();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === filters.category) ?? null,
    [categories, filters.category]
  );

  const selectedSeries = useMemo(
    () => allSeries.find((item) => item.id === filters.series) ?? null,
    [allSeries, filters.series]
  );

  const seriesInTree = Boolean(filters.series) && nodes.some((item) => item.id === filters.series);
  const treeNodeId = filters.node || (seriesInTree ? filters.series : '');
  const selectedNode = useMemo(() => nodes.find((item) => item.id === treeNodeId) ?? null, [nodes, treeNodeId]);

  // A category's own record in the tree (found by its address name): what the dashboard wrote for its search-result title.
  const categoryNode = useMemo(() => (filters.category ? nodes.find((item) => item.slug === filters.category) ?? null : null), [nodes, filters.category]);

  // A series or section opened on its own (no search, filter, order or «show all» on top of it) is a page with its
  // own welcome text, video and one strip of books for each node under it, as the dashboard set it up.
  const pageNodeId = useMemo(() => {
    const onlyTheNode = !filters.q.trim() && !filters.category && !filters.author && !filters.type &&
      filters.min == null && filters.max == null && !filters.availableOnly && !filters.saleOnly &&
      !searchParams.get('sort') && !searchParams.get('view');
    return onlyTheNode ? filters.node || filters.series : '';
  }, [filters, searchParams]);
  const nodePage = useMemo(
    () => (pageNodeId ? buildNodePage(pageNodeId, nodes, nodeLinks, products) : null),
    [pageNodeId, nodes, nodeLinks, products],
  );
  const strips = nodePage?.mode === 'strips';
  // while the dashboard edits this page, its draft decides whether there is anything to show on top
  const pageDraft = useNodePagePreview(nodePage?.node.id);
  const showHero = Boolean(nodePage && (strips || hasNodeIntro(pageDraft ? { ...nodePage.node, ...pageDraft } : nodePage.node)));
  const waitingForNodes = Boolean((filters.node || filters.series) && (loadingNodes || loadingLinks));

  // Title, description and preview for this view of the catalog (a category and a series have their own);
  // a search, an order or any other filter makes it one that doesn't belong in search results.
  useSeo(
    booksListSeo(siteOrigin(), {
      categorySlug: filters.category || null,
      categoryName: selectedCategory?.name ?? categoryNode?.name_ar.trim() ?? null,
      seriesName: selectedSeries?.name ?? null,
      seriesId: filters.series || null,
      nodeId: selectedNode?.id ?? null,
      nodeName: selectedNode?.name_ar ?? null,
      seoTitle: (nodePage?.node ?? selectedNode ?? categoryNode)?.seo_title ?? null,
      seoDescription: (nodePage?.node ?? selectedNode ?? categoryNode)?.seo_description ?? null,
      searched: Boolean(
        filters.q.trim() || filters.type || filters.author || searchParams.get('sort') || searchParams.get('view') ||
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
      nodes: nodes.map((item) => ({ value: item.id, label: `${NODE_TYPE_LABELS[item.type]}: ${item.name_ar}` })),
      authors: authorOptions(products),
      types: productTypes,
      bounds: priceBounds(products),
      currencySymbol: products[0]?.currency_symbol ?? 'ج.م',
      canFilterAvailability: availableIds != null,
    }),
    [categories, allSeries, nodes, products, productTypes, availableIds],
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
        // A series the catalog tree knows lists what the tree says is under it (the same books its page counts);
        // one it doesn't know falls back to the older series list.
        seriesProductIds: filters.series && !seriesInTree && seriesProductIds ? new Set(seriesProductIds) : null,
        nodeProductIds: treeNodeId ? productIdsUnder(nodes, nodeLinks, treeNodeId) : null,
        availableIds,
      }),
    [products, filters, extraCategorySlugs, seriesProductIds, seriesInTree, treeNodeId, nodes, nodeLinks, availableIds],
  );

  const filtersOn = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <div className="page-sections">
      {/* A series page made of strips is the page itself: its search and filters are one click away
          («عرض كل الكتب في قائمة واحدة»), not stacked above the strips. */}
      {pageNodeId && (waitingForNodes || strips) ? null : (
        <BooksFilterBar filters={filters} options={options} setParams={setParams} clearFilters={clearFilters} />
      )}

      {isLoading || waitingForNodes || (filters.series && loadingSeriesIds) ? (
        <section className="page-card page-card--loading" />
      ) : null}

      {!isLoading && !waitingForNodes && showHero && nodePage ? (
        <NodeHero node={nodePage.node} total={nodePage.total} showAllLink={strips} />
      ) : null}

      {!isLoading && !waitingForNodes && strips && nodePage ? <NodeStrips page={nodePage} /> : null}

      {!isLoading && !waitingForNodes && !strips && !(filters.series && loadingSeriesIds) ? (
        <section>
          {showHero ? null : (
            <SectionHeader
              as="h1"
              title={selectedNode?.name_ar || selectedSeries?.name || selectedCategory?.name || 'كل الكتب'}
              subtitle={`${filtered.length} كتاب مطابق للعرض الحالي`}
            />
          )}

          <div className="books-grid books-grid--catalog">
            {filtered.map((product, i) => (
              <ProductCard key={product.product_id} product={product} compact index={i} />
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && !waitingForNodes && !strips && !(filters.series && loadingSeriesIds) && filtered.length === 0 ? (
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
