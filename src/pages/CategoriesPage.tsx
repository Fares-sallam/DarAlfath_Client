import { useMemo } from 'react';
import { ArrowLeft, ChevronDown, Layers3, LibraryBig } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OrnamentDivider } from '@/components/Ornament';
import { useCategories, useProducts } from '@/hooks/useStorefront';

export default function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: products = [] } = useProducts();

  const categoryGroups = useMemo(() => {
    return categories.map((category) => {
      const items = products.filter((product) => product.category_slug === category.id);
      const types = Array.from(new Set(items.map((product) => product.type).filter(Boolean)));

      return {
        ...category,
        products: items,
        types,
      };
    });
  }, [categories, products]);

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
      <section className="taxonomy-hero">
        <span className="page-kicker">التصنيفات والسلاسل</span>
        <h1>وصول أسرع للكتب حسب التصنيف أو المجموعة</h1>
        <p>
          افتح أي تصنيف بمجرد الوقوف عليه، ثم انتقل مباشرة إلى الكتب أو إلى
          صفحة عرض التصنيف بالكامل.
        </p>
        <OrnamentDivider />
      </section>

      {isLoading ? <section className="page-card page-card--loading" /> : null}

      {!isLoading ? (
        <section className="taxonomy-section">
          <div className="section-heading">
            <div>
              <h2>التصنيفات</h2>
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
