import { NavLink } from 'react-router-dom';
import { useCategories } from '@/hooks/useStorefront';

/**
 * Persistent category strip under the header, on every page — the explicit
 * always-visible list (attebyanstore-style), not the hover dropdown already
 * living in Header. That dropdown stays as-is for the full submenu with
 * per-category product previews; this is the one-click jump.
 *
 * Categories come from useCategories(), which derives them from products
 * that actually have stock — so this bar only ever lists categories with
 * real books in them, and fills in on its own as the catalog grows.
 */
export default function CategoryBar() {
  const { data: categories = [] } = useCategories();

  if (categories.length === 0) return null;

  const pillClass = ({ isActive }: { isActive: boolean }) =>
    `category-bar__pill${isActive ? ' active' : ''}`;

  return (
    <nav className="category-bar" aria-label="التصنيفات">
      <div className="container category-bar__track">
        <NavLink to="/books" end className={pillClass}>
          كل الكتب
        </NavLink>
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
