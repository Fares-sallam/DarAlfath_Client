import { FormEvent, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Globe2, Heart, Moon, Search, ShoppingBag, Sun, UserRound } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { useCountry } from '@/contexts/CountryContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCategories, useProducts } from '@/hooks/useStorefront';
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
  const { countries, selectedCountry, setSelectedCountryById } = useCountry();
  const { count: wishlistCount } = useWishlist();
  const { count: cartCount } = useCart();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts();
  const [query, setQuery] = useState('');

  const currentCountryLabel = useMemo(
    () => `${selectedCountry?.name ?? 'مصر'} — ${selectedCountry?.currency_symbol ?? 'ج.م'}`,
    [selectedCountry]
  );

  const categoryMenu = useMemo(() => {
    return categories.slice(0, 8).map((category) => {
      const matchedProducts = products.filter((product) => product.category_slug === category.id);
      return {
        ...category,
        count: matchedProducts.length,
        products: matchedProducts.slice(0, 5),
      };
    });
  }, [categories, products]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    navigate(`/books?${params.toString()}`);
  };

  return (
    <header className="site-header">
      <div className="site-header__top"><span>شحن مجاني داخل مصر للطلبات فوق 499 جنيه</span></div>

      <div className="container site-header__main">
        <Logo disableLink={false} />

        <form className="site-search" onSubmit={onSearch}>
          <button type="submit" className="site-search__icon"><Search size={20} /></button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن كتاب، مؤلف، أو تصنيف..." />
        </form>

        <div className="site-header__actions">
          <div className="country-switcher">
            <Globe2 size={16} />
            <select value={selectedCountry?.id ?? ''} onChange={(event) => setSelectedCountryById(event.target.value)} aria-label="اختر الدولة">
              {countries.map((country) => <option key={country.id} value={country.id}>{country.name} — {country.currency_symbol}</option>)}
            </select>
            <span className="country-switcher__label">{currentCountryLabel}</span>
          </div>

          <Link to="/wishlist" className="header-chip">
            <Heart size={17} /><span>المفضلة</span>{wishlistCount ? <b>{wishlistCount}</b> : null}
          </Link>

          <Link to="/cart" className="header-chip">
            <ShoppingBag size={17} /><span>السلة</span>{cartCount ? <b>{cartCount}</b> : null}
          </Link>

          <Link to="/account" className="header-chip header-chip--filled">
            <UserRound size={17} /><span>{user ? 'حسابي' : 'دخول'}</span>
          </Link>

          <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            aria-label={isDark ? 'تفعيل الوضع المضيء' : 'تفعيل الوضع الداكن'}
            title={isDark ? 'الوضع المضيء' : 'الوضع الداكن'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      <div className="container site-header__nav">
        {navItems.slice(0, 2).map((item) => <NavLink key={item.label} to={item.to}>{item.label}</NavLink>)}

        <div className="nav-dropdown">
          <NavLink to="/categories" className="nav-dropdown__trigger">
            <span>التصنيفات</span>
            <ChevronDown size={16} />
          </NavLink>

          <div className="nav-dropdown__menu" aria-label="قائمة التصنيفات">
            <Link to="/categories" className="nav-dropdown__all">
              عرض كل التصنيفات والسلاسل
            </Link>

            {categoryMenu.map((category) => (
              <div className="nav-dropdown__item" key={category.id}>
                <Link to={`/books?category=${category.id}`} className="nav-dropdown__row">
                  <ChevronLeft size={14} />
                  <span>{category.name}</span>
                  <small>{category.count} كتب</small>
                </Link>

                <div className="nav-dropdown__submenu">
                  {category.products.map((product) => (
                    <Link to={`/book/${product.product_id}`} key={product.product_id}>
                      {product.title}
                    </Link>
                  ))}
                  <Link to={`/books?category=${category.id}`} className="nav-dropdown__view">
                    عرض التصنيف كاملًا
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {navItems.slice(2).map((item) => <NavLink key={item.label} to={item.to}>{item.label}</NavLink>)}
      </div>
    </header>
  );
}
