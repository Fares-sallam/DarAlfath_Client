import ProductCard from '@/components/ProductCard';
import ScrollRail from '@/components/ScrollRail';
import SectionHeader from '@/components/SectionHeader';
import { nodeHref, type NodePageModel } from '@/lib/nodePage';
import type { ProductItem } from '@/types/store';

function Strip({ title, books, total, href, testId }: { title: string; books: ProductItem[]; total: number; href: string; testId: string }) {
  return (
    <section className="node-strip" data-testid={testId}>
      <SectionHeader title={title} subtitle={`${total} كتاب`} href={href} linkLabel="عرض الكل" />
      <ScrollRail ariaLabel={title} className="shelf-rail" drag>
        {books.map((product, i) => (
          <div className="shelf-rail__item" key={product.product_id}>
            <ProductCard product={product} index={i} />
          </div>
        ))}
      </ScrollRail>
    </section>
  );
}

/**
 * One strip of books per node under the page's node (its name above, «عرض الكل» beside it, the books side by side
 * and pulled sideways), then a last strip with the books none of those strips hold.
 */
export default function NodeStrips({ page }: { page: NodePageModel }) {
  return (
    <div className="node-strips">
      {page.strips.map((strip) => (
        <Strip
          key={strip.node.id}
          title={strip.node.name_ar}
          books={strip.books}
          total={strip.total}
          href={nodeHref(strip.node)}
          testId="node-strip"
        />
      ))}
      {page.rest.length > 0 ? (
        <Strip
          title="كتب أخرى"
          books={page.rest.slice(0, Math.max(1, page.node.strips_limit))}
          total={page.rest.length}
          href={`${nodeHref(page.node)}&view=all`}
          testId="node-strip-rest"
        />
      ) : null}
    </div>
  );
}
