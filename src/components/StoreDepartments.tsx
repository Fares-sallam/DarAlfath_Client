import { Link } from 'react-router-dom';
import { LibraryBig } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import ScrollRail from '@/components/ScrollRail';
import { useSeries } from '@/hooks/useStorefront';
import { useReveal } from '@/hooks/useReveal';
import type { SeriesItem } from '@/types/store';

/**
 * "أقسام المتجر" — a quick-nav strip of department cards under the hero
 * banner, each one a book_series row (the same table + admin page as
 * "إدارة السلاسل" in the dashboard: reused deliberately rather than adding
 * a parallel "departments" concept — the admin manages these images there).
 *
 * Renders nothing (and drops no space) until at least one series exists.
 * Each card links to /books?series=<id>, filtered via useSeriesProductIds.
 */
function DepartmentCard({ series }: { series: SeriesItem }) {
  return (
    <Link to={`/books?series=${series.id}`} className="department-card">
      <span className="department-card__visual">
        {series.cover_url ? (
          // Uploaded whole, badge-style — the admin's own graphics already
          // carry their own frame/corners/title banner (see the reference
          // image this was designed against), so this shows the image
          // exactly as given: no crop, no competing border of ours.
          <img src={series.cover_url} alt={series.name} loading="lazy" />
        ) : (
          <span className="department-card__fallback">
            <LibraryBig size={26} />
          </span>
        )}
      </span>
      <span className="department-card__label">{series.name}</span>
    </Link>
  );
}

export default function StoreDepartments() {
  const { data: series = [] } = useSeries();
  // Called unconditionally (rules of hooks) even though the section itself
  // returns null below when empty — a ref that never gets attached is fine.
  const ref = useReveal<HTMLElement>();

  if (series.length === 0) return null;

  return (
    <section ref={ref} className="reveal store-departments">
      <SectionHeader title="أقسام المتجر" href="/books" linkLabel="الكل" />
      <ScrollRail ariaLabel="أقسام المتجر" className="store-departments__rail">
        {series.map((item) => (
          <div className="store-departments__item" key={item.id}>
            <DepartmentCard series={item} />
          </div>
        ))}
      </ScrollRail>
    </section>
  );
}
