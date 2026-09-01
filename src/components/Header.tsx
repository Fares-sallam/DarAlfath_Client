import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Globe2, Heart, Menu, Moon, Search, ShoppingBag, Sun, UserRound, X } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { useCountry } from '@/contexts/CountryContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAllCategoryNames, useProductExtraCategorySlugs, useProducts, useSeries } from '@/hooks/useStorefront';
import type { StoreSettings } from '@/types/store';

const navItems = [
  { label: 'الرئيسية', to: '/' },
  { label: 'الكتب', to: '/books' },
  { label: 'عنّا', to: '/about' },
  { label: 'سياستنا', to: '/policies' },
  { label: 'تواصل معنا', to: '/contact' },
];

export default function Header({ settings }: { settings: StoreSettings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { countries, selectedCountry, setSelectedCountryById } = useCountry();
  const { count: wishlistCount } = useWishlist();
  const { count: cartCount } = useCart();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { data: products = [] } = useProducts();
  const { data: extraCategorySlugs } = useProductExtraCategorySlugs();
  const { data: allSeries = [] } = useSeries();
  const { data: allCategoryNames } = useAllCategoryNames();
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const currentCountryLabel = useMemo(
    () => `${selectedCountry?.name ?? 'مصر'} — ${selectedCountry?.currency_symbol ?? 'ج.م'}`,
    [selectedCountry]
  );

  // Top nav = the real book_series rows (سلسلة الفتح الرباني، قصص وموسوعات...),
  // each expanding to the categories its own member products fall under (primary
  // category or any additional one — same multi-category matching used
  // everywhere else). Mirrors a reference layout the user pointed at: series
  // as the top level, categories nested under each, books nested under those
  // (the existing .nav-dropdown__submenu flyout, unchanged). A series with no
  // categorized products yet just doesn't render — nothing to show under it.
  const seriesMenu = useMemo(() => {
    return allSeries
      .map((series) => {
        const memberIds = new Set(series.product_ids ?? []);
        const memberProducts = products.filter((p) => memberIds.has(p.product_id));

        const catMap = new Map<string, { slug: string; name: string; products: typeof products }>();
        for (const product of memberProducts) {
          const slugs = new Set<string>();
          if (product.category_slug) slugs.add(product.category_slug);
          const extra = extraCategorySlugs?.get(product.product_id);
          if (extra) for (const slug of extra) slugs.add(slug);

          for (const slug of slugs) {
            if (!catMap.has(slug)) {
              // A product's own category_name only describes its PRIMARY
              // category — for a slug reached via its additional categories,
              // resolve the display name from the real categories table
              // (allCategoryNames), not the primary-derived `categories`
              // list below, which never sees a category that's only ever
              // used as someone's ADDITIONAL category.
              const name = (product.category_slug === slug
                ? product.category_name
                : allCategoryNames?.get(slug)) ?? slug;
              catMap.set(slug, { slug, name, products: [] });
            }
            catMap.get(slug)!.products.push(product);
          }
        }

        const categoryList = Array.from(catMap.values())
          .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
          .slice(0, 8)
          .map((c) => ({
            slug: c.slug,
            name: c.name,
            count: c.products.length,
            preview: c.products.slice(0, 5),
          }));

        return { id: series.id, name: series.name, categories: categoryList };
      })
      .filter((series) => series.categories.length > 0);
  }, [allSeries, products, extraCategorySlugs, allCategoryNames]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    navigate(`/books?${params.toString()}`);
    setMobileOpen(false);
  };

  return (
    <header className="site-header">
      <div className="container site-header__main">
        <Logo disableLink={false} />

        <form className="site-search" onSubmit={onSearch}>
          <button type="submit" className="site-search__icon"><Search size={20} /></button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن كتاب، مؤلف، أو تصنيف..." />
        </form>

        <div className="site-header__actions">
          <div className="country-switcher desktop-only">
            <Globe2 size={16} />
            <select value={selectedCountry?.id ?? ''} onChange={(event) => setSelectedCountryById(event.target.value)} aria-label="اختر الدولة">
              {countries.map((country) => <option key={country.id} value={country.id}>{country.name} — {country.currency_symbol}</option>)}
            </select>
            <span className="country-switcher__label">{currentCountryLabel}</span>
          </div>

          <Link to="/wishlist" className="header-chip desktop-only">
            <Heart size={17} /><span>المفضلة</span>{wishlistCount ? <b>{wishlistCount}</b> : null}
          </Link>

          <Link to="/cart" className="header-chip">
            <ShoppingBag size={17} /><span className="desktop-only">السلة</span>{cartCount ? <b>{cartCount}</b> : null}
          </Link>

          <Link to="/account" className="header-chip header-chip--filled desktop-only">
            <UserRound size={17} /><span>{user ? 'حسابي' : 'دخول'}</span>
          </Link>

          <button
            onClick={toggleTheme}
            className="theme-toggle-btn desktop-only"
            aria-label={isDark ? 'تفعيل الوضع المضيء' : 'تفعيل الوضع الداكن'}
            title={isDark ? 'الوضع المضيء' : 'الوضع الداكن'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Hamburger — mobile only */}
          <button
            className="hamburger-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Desktop nav — الرئيسية/الكتب/كل التصنيفات as plain links, then one
          dropdown per series (سلسلة الفتح الرباني، قصص وموسوعات...), each
          expanding to its own categories → books. عنّا/سياستنا/تواصل معنا
          moved out of this row (still reachable from the footer and the
          mobile drawer) — with 5 series dropdowns already filling the row,
          keeping them here risked the exact page-width overflow fixed
          earlier (.page-sections > * { min-width: 0 }), and the reference
          layout this follows doesn't carry them in its top row either. */}
      <div className="container site-header__nav">
        {navItems.slice(0, 2).map((item) => <NavLink key={item.label} to={item.to}>{item.label}</NavLink>)}
        <NavLink to="/categories">كل التصنيفات</NavLink>

        {seriesMenu.map((series) => (
          <div className="nav-dropdown" key={series.id}>
            <NavLink to={`/books?series=${series.id}`} className="nav-dropdown__trigger">
              <span>{series.name}</span>
              <ChevronDown size={16} />
            </NavLink>

            <div className="nav-dropdown__menu" aria-label={`قائمة ${series.name}`}>
              <Link to={`/books?series=${series.id}`} className="nav-dropdown__all">
                عرض كل كتب {series.name}
              </Link>

              {series.categories.map((category) => (
                <div className="nav-dropdown__item" key={category.slug}>
                  <Link
                    to={`/books?series=${series.id}&category=${category.slug}`}
                    className="nav-dropdown__row"
                  >
                    <ChevronLeft size={14} />
                    <span>{category.name}</span>
                    <small>{category.count} كتب</small>
                  </Link>

                  <div className="nav-dropdown__submenu">
                    {category.preview.map((product) => (
                      <Link to={`/book/${product.product_id}`} key={product.product_id}>
                        {product.title}
                      </Link>
                    ))}
                    <Link
                      to={`/books?series=${series.id}&category=${category.slug}`}
                      className="nav-dropdown__view"
                    >
                      عرض التصنيف كاملًا
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Mobile drawer overlay ── */}
      <div
        className={`mobile-nav-overlay${mobileOpen ? ' mobile-nav-overlay--open' : ''}`}
        onClick={() => setMobileOpen(false)}
      >
        <nav
          className={`mobile-nav-drawer${mobileOpen ? ' mobile-nav-drawer--open' : ''}${isDark ? ' mobile-nav-drawer--dark' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer header */}
          <div className="mobile-nav-drawer__top">
            <Logo disableLink={false} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={toggleTheme}
                className="mobile-nav-drawer__theme-btn"
                aria-label={isDark ? 'الوضع المضيء' : 'الوضع الداكن'}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="mobile-nav-drawer__close"
                onClick={() => setMobileOpen(false)}
                aria-label="إغلاق القائمة"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Search */}
          <form className="mobile-nav-drawer__search" onSubmit={onSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن كتاب أو مؤلف..."
            />
            <button type="submit"><Search size={17} /></button>
          </form>

          {/* Country switcher */}
          <div className="mobile-nav-drawer__country">
            <Globe2 size={15} />
            <select
              value={selectedCountry?.id ?? ''}
              onChange={(e) => setSelectedCountryById(e.target.value)}
              aria-label="اختر الدولة"
            >
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.currency_symbol}</option>
              ))}
            </select>
          </div>

          {/* Nav links */}
          <div className="mobile-nav-drawer__links">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/categories" className={({ isActive }) => isActive ? 'active' : ''}>
              التصنيفات
            </NavLink>
          </div>

          {/* Action chips */}
          <div className="mobile-nav-drawer__actions">
            <Link to="/wishlist" className="mobile-nav-chip">
              <Heart size={18} />
              <span>المفضلة</span>
              {wishlistCount ? <b>{wishlistCount}</b> : null}
            </Link>
            <Link to="/cart" className="mobile-nav-chip">
              <ShoppingBag size={18} />
              <span>السلة</span>
              {cartCount ? <b>{cartCount}</b> : null}
            </Link>
            <Link to="/account" className="mobile-nav-chip mobile-nav-chip--filled">
              <UserRound size={18} />
              <span>{user ? 'حسابي' : 'دخول'}</span>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
