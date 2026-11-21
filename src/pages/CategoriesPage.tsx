import { useMemo } from 'react';
import { siteOrigin, useSeo } from '@/hooks/useSeo';
import { staticSeo } from '@/lib/seo';
import { ArrowLeft, ChevronDown, Layers3, LibraryBig } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWebTree } from '@/hooks/useCatalogTree';
import { useCategories, useProductExtraCategorySlugs, useProducts } from '@/hooks/useStorefront';
import type { CatalogNode } from '@/lib/catalogTree';
import { nodeHref, productIdsUnder } from '@/lib/nodePage';
import { categoryGroups } from '@/lib/webCatalog';

/** The page as it was before the catalog tree: every category, then groups derived from the books' type. Used only when the tree can't be read. */
function OlderCategories() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: products = [] } = useProducts();
  const { data: extraCategorySlugs } = useProductExtraCategorySlugs();

  const categoryGroups = useMemo(() => {
    return categories.map((category) => {
      const items = products.filter(
        (product) =>
          product.category_slug === category.id ||
          extraCategorySlugs?.get(product.product_id)?.has(category.id)
      );
      const types = Array.from(new Set(items.map((product) => product.type).filter(Boolean)));

      return {
        ...category,
        products: items,
        types,
      };
    });
  }, [categories, products, extraCategorySlugs]);

  const seriesGroups = useMemo(() => {
    const map = new Map<string, typeof products>();

    products.forEach((product) => {
      const key = product.type || 'كتب عامة';
      const current = map.get(key) ?? [];
      current.push(product);
      map.set(key, current);
    });

    return Array.from(map.entries()).map(([name, items]) => ({
      id: name,
      name,
      products: items,
    }));
  }, [products]);

  return (
    <div className="page-sections">
      {isLoading ? <section className="page-card page-card--loading" /> : null}

      {!isLoading ? (
        <section className="taxonomy-section">
          <div className="section-heading">
            <div>
              <h1>التصنيفات</h1>
              <p>كل تصنيف يعرض الكتب الموجودة بداخله عند الوقوف عليه.</p>
            </div>
          </div>

          <div className="taxonomy-grid">
            {categoryGroups.map((category) => (
              <article className="taxonomy-card" key={category.id}>
                <div className="taxonomy-card__trigger">
                  <div>
                    <span><LibraryBig size={16} /> تصنيف</span>
                    <h3>{category.name}</h3>
                    <p>{category.products.length} كتاب داخل هذا التصنيف</p>
                  </div>
                  <ChevronDown className="taxonomy-card__chevron" size={20} />
                </div>

                <div className="taxonomy-card__panel">
                  {category.types.length > 0 ? (
                    <div className="taxonomy-card__tags">
                      {category.types.slice(0, 4).map((type) => (
                        <Link to={`/books?category=${category.id}&type=${encodeURIComponent(type)}`} key={type}>
                          {type}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  <div className="taxonomy-card__links">
                    {category.products.slice(0, 6).map((product) => (
                      <Link to={`/book/${product.product_id}`} key={product.product_id}>
                        <span>{product.title}</span>
                        <ArrowLeft size={13} />
                      </Link>
                    ))}
                  </div>

                  <Link to={`/books?category=${category.id}`} className="taxonomy-card__all">
                    عرض كل كتب {category.name}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading ? (
        <section className="taxonomy-section">
          <div className="section-heading">
            <div>
              <h2>السلاسل والمجموعات</h2>
              <p>مجموعات مشتقة من نوع المنتج المتاح في الكتالوج العام.</p>
            </div>
          </div>

          <div className="taxonomy-grid taxonomy-grid--series">
            {seriesGroups.map((series) => (
              <article className="taxonomy-card taxonomy-card--series" key={series.id}>
                <div className="taxonomy-card__trigger">
                  <div>
                    <span><Layers3 size={16} /> مجموعة</span>
                    <h3>{series.name}</h3>
                    <p>{series.products.length} كتاب</p>
                  </div>
                  <ChevronDown className="taxonomy-card__chevron" size={20} />
                </div>

                <div className="taxonomy-card__panel">
                  <div className="taxonomy-card__links">
                    {series.products.slice(0, 6).map((product) => (
                      <Link to={`/book/${product.product_id}`} key={product.product_id}>
                        <span>{product.title}</span>
                        <ArrowLeft size={13} />
                      </Link>
                    ))}
                  </div>

                  <Link to={`/books?type=${encodeURIComponent(series.name)}`} className="taxonomy-card__all">
                    عرض المجموعة
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A category's own page: the plain category list, or (when it has categories inside it) the node page that covers them too. */
const categoryHref = (node: CatalogNode, hasChildren: boolean) =>
  hasChildren || !node.slug ? `/books?node=${node.id}` : `/books?category=${encodeURIComponent(node.slug)}`;

/**
 * The categories page from the catalog tree: every category that has books, grouped under the series (or section) it sits
 * in, in the website's order, each group headed by a link to that series' own page.
 */
function TreeCategories() {
  const tree = useWebTree();
  const groups = useMemo(() => categoryGroups(tree.nodes, tree.counts), [tree.nodes, tree.counts]);
  const byId = useMemo(() => new Map(tree.products.map((p) => [p.product_id, p])), [tree.products]);

  const card = (node: CatalogNode) => {
    const hasChildren = tree.nodes.some((n) => n.parent_id === node.id);
    const books = [...productIdsUnder(tree.nodes, tree.links, node.id)]
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .sort((a, b) => a.title.localeCompare(b.title, 'ar'));
    const types = Array.from(new Set(books.map((p) => p.type).filter(Boolean)));
    const href = categoryHref(node, hasChildren);
    const name = node.name_ar.trim();
    return (
      <article className="taxonomy-card" key={node.id} data-testid="taxonomy-card">
        <div className="taxonomy-card__trigger">
          <div>
            <span><LibraryBig size={16} /> تصنيف</span>
            <h3>{name}</h3>
            <p>{books.length} كتاب داخل هذا التصنيف</p>
          </div>
          <ChevronDown className="taxonomy-card__chevron" size={20} />
        </div>

        <div className="taxonomy-card__panel">
          {types.length > 0 && !hasChildren ? (
            <div className="taxonomy-card__tags">
              {types.slice(0, 4).map((type) => (
                <Link to={`${href}&type=${encodeURIComponent(type)}`} key={type}>{type}</Link>
              ))}
            </div>
          ) : null}
          <div className="taxonomy-card__links">
            {books.slice(0, 6).map((product) => (
              <Link to={`/book/${product.product_id}`} key={product.product_id}>
                <span>{product.title}</span>
                <ArrowLeft size={13} />
              </Link>
            ))}
          </div>
          <Link to={href} className="taxonomy-card__all">عرض كل كتب {name}</Link>
        </div>
      </article>
    );
  };

  return (
    <div className="page-sections">
      <section className="taxonomy-section">
        <div className="section-heading">
          <div>
            <h1>التصنيفات</h1>
            <p>كل تصنيف يعرض الكتب الموجودة بداخله عند الوقوف عليه.</p>
          </div>
        </div>
      </section>

      {groups.map((group) => (
        <section className="taxonomy-section" key={group.parent?.id ?? 'others'} data-testid="taxonomy-group">
          <div className="section-heading">
            <div>
              <h2>{group.parent ? group.parent.name_ar.trim() : 'تصنيفات أخرى'}</h2>
            </div>
            {group.parent ? <Link to={nodeHref(group.parent)} data-ab-btn="view_all">عرض {group.parent.name_ar.trim()}</Link> : null}
          </div>
          <div className="taxonomy-grid">{group.categories.map(card)}</div>
        </section>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  useSeo(staticSeo('categories', siteOrigin()));
  const tree = useWebTree();
  if (tree.loading) return <div className="page-sections"><section className="page-card page-card--loading" /></div>;
  return tree.hasTree ? <TreeCategories /> : <OlderCategories />;
}
