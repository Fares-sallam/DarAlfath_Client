import { Link } from 'react-router-dom';
import { LibraryBig } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import ScrollRail from '@/components/ScrollRail';
import { useDepartmentCards, useWebTree } from '@/hooks/useCatalogTree';
import { useSeries } from '@/hooks/useStorefront';
import { webSeries } from '@/lib/webCatalog';
import { useDepartmentsPreview } from '@/lib/displayPreview';
import { nodeHref } from '@/lib/nodePage';
import { useReveal } from '@/hooks/useReveal';

interface Card {
  id: string;
  name: string;
  href: string;
  image: string | null;
}

/**
 * "أقسام المتجر" — a quick-nav strip of department cards under the hero banner. Which cards, in what order and with which
 * pictures is what the dashboard's «أقسام المتجر» tab chose (existing sections, series and categories of the catalog tree);
 * a card whose node is switched off for the website, or is empty and set to hide when empty, is left out. When the list
 * can't be read, every series is drawn, as before.
 *
 * Renders nothing (and drops no space) until at least one card exists. Each card opens that node's own page.
 */
function DepartmentCard({ card }: { card: Card }) {
  return (
    <Link to={card.href} className="department-card">
      <span className="department-card__visual">
        {card.image ? (
          // Uploaded whole, badge-style — the admin's own graphics already
          // carry their own frame/corners/title banner (see the reference
          // image this was designed against), so this shows the image
          // exactly as given: no crop, no competing border of ours.
          <img src={card.image} alt={card.name} loading="lazy" />
        ) : (
          <span className="department-card__fallback">
            <LibraryBig size={26} />
          </span>
        )}
      </span>
      <span className="department-card__label">{card.name}</span>
    </Link>
  );
}

export default function StoreDepartments({ title = 'أقسام المتجر', blockKey }: { title?: string; blockKey?: string }) {
  const tree = useWebTree();
  const { data: saved, isLoading: loadingCards } = useDepartmentCards();
  const draft = useDepartmentsPreview();
  const ids = draft?.ids ?? saved ?? null;
  const { data: legacySeries = [] } = useSeries({ enabled: !tree.loading && !tree.hasTree });

  let cards: Card[];
  if (tree.hasTree && ids) {
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));
    cards = ids
      .map((id) => byId.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .filter((node) => !node.hide_when_empty || (tree.counts.get(node.id) ?? 0) > 0)
      .map((node) => ({
        id: node.id,
        name: node.name_ar.trim(),
        href: nodeHref(node),
        image: draft && node.id in draft.images ? draft.images[node.id] : node.image_url,
      }));
  } else if (tree.hasTree) {
    cards = loadingCards ? [] : webSeries(tree.nodes, tree.counts).map((node) => ({ id: node.id, name: node.name_ar.trim(), href: nodeHref(node), image: node.image_url }));
  } else {
    cards = tree.loading ? [] : legacySeries.map((series) => ({ id: series.id, name: series.name, href: `/books?series=${series.id}`, image: series.cover_url ?? null }));
  }

  // Called unconditionally (rules of hooks) even though the section itself
  // returns null below when empty — a ref that never gets attached is fine.
  const ref = useReveal<HTMLElement>();

  if (cards.length === 0) return null;

  return (
    <section ref={ref} className="reveal store-departments" data-block-key={blockKey}>
      <SectionHeader title={title} href="/books" linkLabel="الكل" />
      <ScrollRail ariaLabel={title} className="store-departments__rail">
        {cards.map((card) => (
          <div className="store-departments__item" key={card.id}>
            <DepartmentCard card={card} />
          </div>
        ))}
      </ScrollRail>
    </section>
  );
}
