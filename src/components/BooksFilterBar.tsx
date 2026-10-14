import { useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { SORT_LABELS, activeFilterCount, type AuthorOption, type CatalogFilters, type SortKey } from '@/lib/catalogFilters';

interface Option { value: string; label: string }

export interface FilterOptions {
  categories: Option[];
  series: Option[];
  authors: AuthorOption[];
  types: string[];
  /** Cheapest and dearest price in the catalog, as hints in the price fields. */
  bounds: { min: number; max: number } | null;
  currencySymbol: string;
  /** False when stock couldn't be read: the "available only" switch is then left out. */
  canFilterAvailability: boolean;
}

/**
 * The books page's search and filters: search and order always on view; the rest in a panel that is
 * open on a wide screen and behind a "فلاتر" button on a phone. What is on shows as chips below, each
 * removable, with one button to clear them all.
 */
export default function BooksFilterBar({
  filters,
  options,
  setParams,
  clearFilters,
}: {
  filters: CatalogFilters;
  options: FilterOptions;
  /** Several changes in one go (an empty value removes the key). `replace`: a field being typed in. */
  setParams: (changes: Record<string, string>, replace?: boolean) => void;
  clearFilters: () => void;
}) {
  const setParam = (key: string, value: string, replace = false) => setParams({ [key]: value }, replace);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  // The price fields are typed in: keep what is typed, send it on once the typing pauses.
  const [minText, setMinText] = useState(filters.min?.toString() ?? '');
  const [maxText, setMaxText] = useState(filters.max?.toString() ?? '');
  const sent = useRef({ min: filters.min?.toString() ?? '', max: filters.max?.toString() ?? '' });
  useEffect(() => {
    // The address changed from elsewhere (clear all, a chip, back/forward).
    const min = filters.min?.toString() ?? '';
    const max = filters.max?.toString() ?? '';
    if (min !== sent.current.min) { sent.current.min = min; setMinText(min); }
    if (max !== sent.current.max) { sent.current.max = max; setMaxText(max); }
  }, [filters.min, filters.max]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const changes: Record<string, string> = {};
      if (minText.trim() !== sent.current.min) { sent.current.min = minText.trim(); changes.min = minText.trim(); }
      if (maxText.trim() !== sent.current.max) { sent.current.max = maxText.trim(); changes.max = maxText.trim(); }
      // Both fields in one change: two calls in a row would each start from the same address and the second would undo the first.
      if (Object.keys(changes).length > 0) setParams(changes, true);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minText, maxText]);

  const label = (list: Option[], value: string) => list.find((o) => o.value === value)?.label ?? value;
  const priceLabel =
    filters.min != null && filters.max != null ? `${filters.min} – ${filters.max} ${options.currencySymbol}`
    : filters.min != null ? `من ${filters.min} ${options.currencySymbol}`
    : filters.max != null ? `حتى ${filters.max} ${options.currencySymbol}`
    : '';

  const chips: { key: string; text: string; remove: () => void }[] = [
    filters.category && { key: 'category', text: `التصنيف: ${label(options.categories, filters.category)}`, remove: () => setParam('category', '') },
    filters.series && { key: 'series', text: `السلسلة: ${label(options.series, filters.series)}`, remove: () => setParam('series', '') },
    filters.author && { key: 'author', text: `المؤلف: ${options.authors.find((a) => a.key === filters.author)?.label ?? filters.author}`, remove: () => setParam('author', '') },
    filters.type && { key: 'type', text: `النوع: ${filters.type}`, remove: () => setParam('type', '') },
    priceLabel && { key: 'price', text: `السعر: ${priceLabel}`, remove: () => setParams({ min: '', max: '' }) },
    filters.availableOnly && { key: 'available', text: 'متاح فقط', remove: () => setParam('available', '') },
    filters.saleOnly && { key: 'sale', text: 'عروض فقط', remove: () => setParam('sale', '') },
  ].filter(Boolean) as { key: string; text: string; remove: () => void }[];

  return (
    <section className="catalog-filters" aria-label="البحث وتصفية الكتب">
      <div className="catalog-filters__main">
        <input
          className="catalog-filters__search"
          value={filters.q}
          onChange={(e) => setParam('q', e.target.value, true)}
          placeholder="ابحث عن كتاب، مؤلف، أو تصنيف..."
          aria-label="ابحث في هذه الصفحة"
        />
        <label className="catalog-filters__sort">
          <span className="catalog-filters__label">الترتيب</span>
          <select aria-label="الترتيب" value={filters.sort} onChange={(e) => setParam('sort', e.target.value === 'title' ? '' : e.target.value)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>{SORT_LABELS[key]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="catalog-filters__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal size={16} />
          فلاتر
          {count > 0 && <b className="catalog-filters__count" data-testid="filters-count">{count}</b>}
        </button>
      </div>

      <div className="catalog-filters__panel" id={panelId} data-open={open}>
        <label className="catalog-filters__field">
          <span className="catalog-filters__label">التصنيف</span>
          <select aria-label="التصنيف" value={filters.category} onChange={(e) => setParam('category', e.target.value)}>
            <option value="">كل التصنيفات</option>
            {options.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {options.series.length > 0 && (
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">السلسلة</span>
            <select aria-label="السلسلة" value={filters.series} onChange={(e) => setParam('series', e.target.value)}>
              <option value="">كل السلاسل</option>
              {options.series.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}

        {options.authors.length > 1 && (
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">المؤلف</span>
            <select aria-label="المؤلف" value={filters.author} onChange={(e) => setParam('author', e.target.value)}>
              <option value="">كل المؤلفين</option>
              {options.authors.map((a) => <option key={a.key} value={a.key}>{`${a.label} (${a.count})`}</option>)}
            </select>
          </label>
        )}

        <label className="catalog-filters__field">
          <span className="catalog-filters__label">النوع</span>
          <select aria-label="النوع" value={filters.type} onChange={(e) => setParam('type', e.target.value)}>
            <option value="">كل الأنواع</option>
            {options.types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <div className="catalog-filters__field catalog-filters__price" role="group" aria-label={`السعر بالـ ${options.currencySymbol}`}>
          <span className="catalog-filters__label">السعر ({options.currencySymbol})</span>
          <div>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              placeholder={options.bounds ? `من ${options.bounds.min}` : 'من'}
              aria-label="أقل سعر"
            />
            <i aria-hidden="true">–</i>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              placeholder={options.bounds ? `إلى ${options.bounds.max}` : 'إلى'}
              aria-label="أعلى سعر"
            />
          </div>
        </div>

        <div className="catalog-filters__switches">
          {options.canFilterAvailability && (
            <label className="catalog-filters__switch">
              <input type="checkbox" checked={filters.availableOnly} onChange={(e) => setParam('available', e.target.checked ? '1' : '')} />
              <span>متاح فقط</span>
            </label>
          )}
          <label className="catalog-filters__switch">
            <input type="checkbox" checked={filters.saleOnly} onChange={(e) => setParam('sale', e.target.checked ? '1' : '')} />
            <span>عروض فقط</span>
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="catalog-filters__active" aria-label="الفلاتر المفعّلة">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="catalog-filters__chip" onClick={chip.remove} aria-label={`إزالة ${chip.text}`}>
              {chip.text}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="catalog-filters__clear" onClick={clearFilters}>
            مسح الفلاتر
          </button>
        </div>
      )}
    </section>
  );
}
