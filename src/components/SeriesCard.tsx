import { Link } from 'react-router-dom';
import { LibraryBig } from 'lucide-react';
import type { SeriesItem } from '@/types/store';

export default function SeriesCard({ series }: { series: SeriesItem }) {
  return (
    <Link to={`/books?series=${series.id}`} className="series-card">
      <div className="series-card__visual">
        {series.cover_url ? (
          <img src={series.cover_url} alt={series.name} loading="lazy" />
        ) : (
          <div className="series-card__fallback">
            <LibraryBig size={22} />
          </div>
        )}
      </div>

      <div className="series-card__content">
        <h3 title={series.name}>{series.name}</h3>
        <p>
          {series.description || 'ابدأ من هذه السلسلة ثم استعرض كتبها بشكل منظم.'}
        </p>
        <span>{series.products_count ?? 0} كتاب</span>
      </div>
    </Link>
  );
}