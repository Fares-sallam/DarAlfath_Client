import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import BookCover from '@/components/BookCover';
import { formatCatalogPrice, useProducts } from '@/hooks/useStorefront';
import { searchProducts } from '@/lib/search';

/** How many books the list shows; the rest are one click away on the results page. */
const MAX_SHOWN = 6;

interface PanelPosition { top: number; left: number; width: number }

/**
 * The search box: results appear under it and change with every letter, so a book can be
 * found (and opened) without leaving the page. Enter with nothing picked, or the "all results"
 * row, goes to the full results page. In the header the list floats under the box; in the
 * mobile menu it sits inline below it.
 */
export default function LiveSearch({
  value,
  onChange,
  variant = 'header',
  placeholder,
  onNavigate,
}: {
  value: string;
  onChange: (value: string) => void;
  variant?: 'header' | 'drawer';
  placeholder: string;
  /** Called after the visitor moves to a page from here (e.g. to close the mobile menu). */
  onNavigate?: () => void;
}) {
  const { data: products = [], isLoading } = useProducts();
  const navigate = useNavigate();
  const location = useLocation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => searchProducts(products, value), [products, value]);
  const shown = results.slice(0, MAX_SHOWN);
  const rowCount = shown.length + (results.length > 0 ? 1 : 0); // + the "all results" row
  const visible = open && value.trim() !== '';
  const floating = variant === 'header';

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const done = () => {
    close();
    onNavigate?.();
  };

  const goToResults = () => {
    const params = new URLSearchParams();
    if (value.trim()) params.set('q', value.trim());
    navigate(`/books?${params.toString()}`);
    done();
  };

  // A new page closes the list.
  useEffect(close, [location.pathname, location.search]);

  // Floating list: sits under the box, as wide as the box but never narrower than a readable
  // list, and inside the screen. Re-placed while it is open if the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!visible || !floating) return;
    const place = () => {
      const box = formRef.current?.getBoundingClientRect();
      if (!box) return;
      const margin = 10;
      const width = Math.min(Math.max(box.width, 360), 520, window.innerWidth - margin * 2);
      // RTL page: line the list up with the box's right edge.
      const left = Math.min(Math.max(box.right - width, margin), window.innerWidth - width - margin);
      setPosition({ top: box.bottom + 8, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible, floating]);

  // A click anywhere else closes it.
  useEffect(() => {
    if (!visible) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (formRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [visible]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (value.trim() === '' || rowCount === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + rowCount) % rowCount);
      return;
    }
    if (event.key === 'Enter' && visible && active >= 0) {
      event.preventDefault();
      if (active < shown.length) {
        navigate(`/book/${shown[active].id}`);
        done();
      } else {
        goToResults();
      }
    }
  };

  const onBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && (formRef.current?.contains(next) || panelRef.current?.contains(next))) return;
    // Clicks on the list are handled by pointerdown above; this is for tabbing away.
    if (next) close();
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  const list = visible && (
    <div
      ref={panelRef}
      className={`live-search__panel live-search__panel--${variant}`}
      style={floating && position ? { top: position.top, left: position.left, width: position.width } : undefined}
      onBlur={onBlur}
      data-testid="live-search-panel"
    >
      <div className="live-search__status" role="status" aria-live="polite">
        {results.length > 0 ? `${results.length} نتيجة` : 'لا توجد نتائج'}
      </div>
      {results.length > 0 ? (
        <ul id={listId} role="listbox" aria-label="نتائج البحث" className="live-search__list">
          {shown.map((product, index) => (
            <li key={product.product_id} role="presentation">
              <Link
                id={optionId(index)}
                role="option"
                aria-selected={active === index}
                to={`/book/${product.id}`}
                className={`live-search__item${active === index ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={done}
              >
                <span className="live-search__thumb">
                  <BookCover title={product.title} author={product.author} coverUrl={product.cover_url} compact />
                </span>
                <span className="live-search__text">
                  <strong className="live-search__title">{product.title}</strong>
                  <span className="live-search__meta">
                    {[product.author, product.category_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="live-search__price">{formatCatalogPrice(product)}</span>
              </Link>
            </li>
          ))}
          <li role="presentation">
            <Link
              id={optionId(shown.length)}
              role="option"
              aria-selected={active === shown.length}
              to={`/books?q=${encodeURIComponent(value.trim())}`}
              className={`live-search__all${active === shown.length ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(shown.length)}
              onClick={done}
            >
              {results.length > shown.length ? `عرض كل النتائج (${results.length})` : 'عرض في صفحة الكتب'}
            </Link>
          </li>
        </ul>
      ) : (
        <p className="live-search__empty">
          {isLoading ? 'جارٍ تحميل الكتب...' : <>لا توجد نتائج لـ «{value.trim()}». جرّب كلمة أخرى، أو <Link to="/books" onClick={done}>تصفّح كل الكتب</Link>.</>}
        </p>
      )}
    </div>
  );

  return (
    <>
      <form
        ref={formRef}
        className={variant === 'drawer' ? 'mobile-nav-drawer__search' : 'site-search'}
        onSubmit={(event) => {
          event.preventDefault();
          goToResults();
        }}
        onBlur={onBlur}
        role="search"
      >
        {variant === 'header' && (
          <button type="submit" className="site-search__icon" aria-label="بحث">
            <Search size={20} />
          </button>
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => value.trim() !== '' && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={visible && results.length > 0}
          aria-controls={visible && results.length > 0 ? listId : undefined}
          aria-activedescendant={visible && active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label="ابحث في الكتب"
          autoComplete="off"
          enterKeyHint="search"
        />
        {value !== '' && (
          <button
            type="button"
            className="live-search__clear"
            aria-label="مسح البحث"
            onClick={() => {
              onChange('');
              close();
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
        {variant === 'drawer' && (
          <button type="submit" aria-label="بحث">
            <Search size={17} />
          </button>
        )}
      </form>
      {floating ? list && createPortal(list, document.body) : list}
    </>
  );
}
