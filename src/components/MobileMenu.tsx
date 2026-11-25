import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { MenuView } from '@/lib/menuView';

/** True when the entry, or anything inside it, is the page being looked at (so that branch starts open). */
function holdsCurrent(item: MenuView, current: string): boolean {
  if (item.to && !item.external && item.to === current) return true;
  return item.children.some((child) => holdsCurrent(child, current));
}

/** One entry of the phone menu: a link, an outside link, or a branch that opens what is inside it right below. */
function Entry({ item, level, open, toggle, current, onNavigate }: {
  item: MenuView;
  level: number;
  open: ReadonlySet<string>;
  toggle: (key: string) => void;
  current: string;
  onNavigate: () => void;
}) {
  const pad = { paddingInlineStart: 16 + level * 16 };

  if (item.children.length === 0) {
    if (!item.to) return null;
    if (item.external) {
      return <a href={item.to} target="_blank" rel="noopener noreferrer" style={pad} data-testid="mobile-menu-item" data-key={item.key} onClick={onNavigate}>{item.label}</a>;
    }
    return <NavLink to={item.to} end={item.to === '/'} style={pad} data-testid="mobile-menu-item" data-key={item.key} onClick={onNavigate}>{item.label}</NavLink>;
  }

  const isOpen = open.has(item.key) || (!open.has(`closed:${item.key}`) && holdsCurrent(item, current));
  const panelId = `mobile-menu-${item.key}`;
  return (
    <div className="mobile-menu__branch" data-testid="mobile-menu-branch" data-key={item.key} data-open={isOpen ? 'true' : 'false'}>
      <div className="mobile-menu__head">
        {item.to ? (
          <NavLink to={item.to} end={item.to === '/'} style={pad} className="mobile-menu__label" onClick={onNavigate}>{item.label}</NavLink>
        ) : (
          <button type="button" style={pad} className="mobile-menu__label" onClick={() => toggle(item.key)} aria-expanded={isOpen} aria-controls={panelId}>{item.label}</button>
        )}
        <button
          type="button"
          className="mobile-menu__toggle"
          onClick={() => toggle(item.key)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={`${isOpen ? 'طي' : 'فتح'} ${item.label}`}
          data-testid="mobile-menu-toggle"
        >
          <ChevronDown size={18} className={isOpen ? 'mobile-menu__chev mobile-menu__chev--open' : 'mobile-menu__chev'} />
        </button>
      </div>
      {isOpen ? (
        <div className="mobile-menu__children" id={panelId}>
          {item.to && item.kind === 'node' ? (
            <Link to={item.to} style={{ paddingInlineStart: 16 + (level + 1) * 16 }} className="mobile-menu__all" onClick={onNavigate}>عرض كل كتب {item.label}</Link>
          ) : null}
          {item.children.map((child) => (
            <Entry key={child.key} item={child} level={level + 1} open={open} toggle={toggle} current={current} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The phone's menu: the same entries the dashboard's «خريطة العرض» gives the top menu on a computer (links, headings that
 * gather others, series / categories / sections, as deep as the map goes), opened one branch at a time by tapping its arrow.
 */
export default function MobileMenu({ entries, onNavigate }: { entries: MenuView[]; onNavigate: () => void }) {
  const location = useLocation();
  const current = `${location.pathname}${location.search}`;
  // keys of branches opened by hand, and `closed:<key>` for a branch that was closed by hand although it holds the current page
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      const holdsNow = (list: MenuView[]): boolean => list.some((e) => e.key === key ? holdsCurrent(e, current) : holdsNow(e.children));
      const showing = next.has(key) || (!next.has(`closed:${key}`) && holdsNow(entries));
      if (showing) {
        next.delete(key);
        next.add(`closed:${key}`);
      } else {
        next.delete(`closed:${key}`);
        next.add(key);
      }
      return next;
    });

  return (
    <>
      {entries.map((item) => (
        <Entry key={item.key} item={item} level={0} open={open} toggle={toggle} current={current} onNavigate={onNavigate} />
      ))}
    </>
  );
}
