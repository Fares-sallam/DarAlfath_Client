import { NavLink } from 'react-router-dom';
import { useCategoryBar, useSiteContent } from '@/hooks/useStorefront';

/**
 * Persistent category strip under the header, on every page — the one-click jump (the header's hover
 * menus hold the full submenus).
 *
 * Which categories show, and in what order, is set in the dashboard (إدارة الإعلانات والأشرطة →
 * شريط التصنيفات), as is "كل الكتب" at its head. Only categories with books in them are ever listed,
 * so the strip fills in on its own as the catalog grows.
 */
export default function CategoryBar() {
  const { data: categories, isLoading } = useCategoryBar();
  const { data: content, isLoading: contentLoading } = useSiteContent();
  const showAll = content?.all_books_in_bar ?? true;

  // Drawn once it's known what goes in it, so nothing appears and then leaves.
  if (isLoading || contentLoading || (categories.length === 0 && !showAll)) return null;

  const pillClass = ({ isActive }: { isActive: boolean }) =>
    `category-bar__pill${isActive ? ' active' : ''}`;

  return (
    <nav className="category-bar" aria-label="التصنيفات">
      <div className="container category-bar__track">
        {showAll && (
          <NavLink to="/books" end className={pillClass}>
            كل الكتب
          </NavLink>
        )}
        {categories.map((category) => (
          <NavLink
            key={category.id}
            to={`/books?category=${category.id}`}
            className={pillClass}
          >
            {category.name}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
