import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductCard from '@/components/ProductCard';
import { useWishlist } from '@/contexts/WishlistContext';
import { useWishlistProducts } from '@/hooks/useStorefront';

export default function WishlistPage() {
  const { wishlistIds, clearWishlist } = useWishlist();
  const { data: items = [] } = useWishlistProducts(wishlistIds);

  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="page-card__head">
          <div>
            <span className="page-kicker">قائمة المفضلة</span>
            <h1>الكتب التي أعجبتك</h1>
            <p>كل ما حفظته سيظهر هنا لتعود إليه بسهولة لاحقًا.</p>
          </div>
          {items.length ? <button type="button" className="ghost-button" onClick={clearWishlist}>مسح القائمة</button> : null}
        </div>

        {items.length ? (
          <div className="books-grid">{items.map((item) => <ProductCard key={item.id} product={item} compact />)}</div>
        ) : (
          <div className="empty-state">
            <Heart size={24} />
            <h3>لا توجد كتب محفوظة</h3>
            <p>اضغط على القلب في أي كتاب لإضافته إلى هذه الصفحة.</p>
            <Link to="/books" className="primary-button">الذهاب إلى الكتب</Link>
          </div>
        )}
      </section>
    </div>
  );
}
