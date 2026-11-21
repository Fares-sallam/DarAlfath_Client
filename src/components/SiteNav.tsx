import { ChevronDown, ChevronLeft } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { flyoutDepth, type MenuView } from '@/lib/menuView';

/** One row of a menu: a link, an outside link, or (for a group) a heading that only opens what is inside it. */
function Row({ item }: { item: MenuView }) {
  const inside = (
    <>
      <ChevronLeft size={14} />
      <span>{item.label}</span>
      {item.kind === 'node' && item.count > 0 ? <small>{item.count} كتب</small> : <small />}
    </>
  );
  if (!item.to) return <span className="nav-dropdown__row nav-dropdown__row--group" tabIndex={0}>{inside}</span>;
  if (item.external) return <a className="nav-dropdown__row" href={item.to} target="_blank" rel="noopener noreferrer">{inside}</a>;
  return <Link className="nav-dropdown__row" to={item.to}>{inside}</Link>;
}

/** The rows of one menu; a row with something inside opens it beside itself, as far down as the menu goes. */
function FlyoutList({ items }: { items: MenuView[] }) {
  return (
    <>
      {items.map((item) => (
        <div className="nav-flyout__item" key={item.key} data-menu-item={item.label}>
          <Row item={item} />
          {item.children.length > 0 ? (
            <div className="nav-flyout__panel" aria-label={`قائمة ${item.label}`}>
              {item.to && item.kind === 'node' ? (
                <Link to={item.to} className="nav-dropdown__all">عرض كل كتب {item.label}</Link>
              ) : null}
              <FlyoutList items={item.children} />
            </div>
          ) : item.preview.length > 0 && item.to ? (
            <div className="nav-dropdown__submenu">
              {item.preview.map((product) => (
                <Link to={`/book/${product.product_id}`} key={product.product_id}>{product.title}</Link>
              ))}
              <Link to={item.to} className="nav-dropdown__view">عرض التصنيف كاملًا</Link>
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

/**
 * The top menu's entries, as the dashboard's «خريطة العرض» lays them out: plain links, and menus that open on hover
 * (or focus) — each row with something inside opens it beside itself, down to a list of the category's books.
 */
export default function SiteNav({ entries, flipped }: { entries: MenuView[]; flipped: ReadonlySet<string> }) {
  return (
    <>
      {entries.map((item) => {
        if (item.children.length === 0) {
          if (!item.to) return null;
          if (item.external) return <a key={item.key} href={item.to} target="_blank" rel="noopener noreferrer">{item.label}</a>;
          return <NavLink key={item.key} to={item.to} end={item.to === '/'}>{item.label}</NavLink>;
        }
        const trigger = (
          <>
            <span>{item.label}</span>
            <ChevronDown size={16} />
          </>
        );
        return (
          <div
            className={`nav-dropdown${flipped.has(item.key) ? ' nav-dropdown--flip' : ''}`}
            key={item.key}
            data-series={item.key}
            data-flyouts={Math.max(...item.children.map(flyoutDepth))}
          >
            {item.to ? (
              <NavLink to={item.to} className="nav-dropdown__trigger">{trigger}</NavLink>
            ) : (
              <span className="nav-dropdown__trigger nav-dropdown__trigger--group" tabIndex={0}>{trigger}</span>
            )}
            <div
              className={`nav-dropdown__menu${item.children.length > 8 ? ' nav-dropdown__menu--dense' : ''}`}
              aria-label={`قائمة ${item.label}`}
            >
              {item.to && item.kind === 'node' ? (
                <Link to={item.to} className="nav-dropdown__all">عرض كل كتب {item.label}</Link>
              ) : null}
              <FlyoutList items={item.children} />
            </div>
          </div>
        );
      })}
    </>
  );
}
