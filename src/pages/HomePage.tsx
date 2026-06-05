import { ArrowLeft, BookOpenText, CreditCard, Headphones, LibraryBig, Sparkles, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import FeatureCard from '@/components/FeatureCard';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import VideoCard from '@/components/VideoCard';
import { introVideos } from '@/data/introVideos';
import { useHomeCategorySections, useProducts, useStoreSettings } from '@/hooks/useStorefront';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function HomePage() {
  usePageTitle();
  const { data: settings } = useStoreSettings();
  const { data: products = [] } = useProducts();
  const { data: categorySections = [] } = useHomeCategorySections(4);
  const featuredProducts = products.slice(0, 8);
  const heroProducts = products.filter((product) => product.cover_url).slice(0, 3);
  const categoryCount = new Set(products.map((product) => product.category_slug).filter(Boolean)).size;

  return (
    <div className="page-sections">
      <section className="hero-banner hero-banner--editorial">
        <div className="hero-banner__content">
          <span className="hero-badge" style={{ '--i': 0 } as React.CSSProperties}>
            <Sparkles size={16} />
            مكتبة عربية متصلة مباشرة بالكتالوج
          </span>
          <h1 style={{ '--i': 1 } as React.CSSProperties}>اختَر كتابك كأنك تتجول بين رفوف دار الفتح</h1>
          <p style={{ '--i': 2 } as React.CSSProperties}>
            {settings?.store_description ||
              'تجربة شراء عربية هادئة تعرض الكتب والنسخ والأسعار بوضوح، وتربطك مباشرة بالكتالوج الآمن للزوار.'}
          </p>

          <div className="hero-metrics" aria-label="إحصاءات المكتبة" style={{ '--i': 3 } as React.CSSProperties}>
            <div>
              <strong>{products.length || '+'}</strong>
              <span>كتاب متاح</span>
            </div>
            <div>
              <strong>{categoryCount || '+'}</strong>
              <span>تصنيف</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>تصفح وطلب</span>
            </div>
          </div>

          <div className="hero-actions" style={{ '--i': 4 } as React.CSSProperties}>
            <Link to="/books" className="primary-button">
              تسوّق الكتب
              <ArrowLeft size={16} />
            </Link>
            <Link to="/categories" className="ghost-button ghost-button--light">
              استكشف التصنيفات
            </Link>
            <Link to="/account" className="ghost-button ghost-button--light">
              أنشئ حسابك
            </Link>
          </div>
        </div>

        <div className="hero-showcase" aria-label="كتب مختارة">
          <div className="hero-showcase__orb" />
          <div className="hero-shelf">
            {heroProducts.length ? (
              heroProducts.map((product, index) => (
                <Link
                  to={`/book/${product.product_id}`}
                  className={`hero-featured-book hero-featured-book--${index + 1}`}
                  key={product.product_id}
                >
                  <img src={product.cover_url || ''} alt={product.title} />
                  <span>{product.title}</span>
                </Link>
              ))
            ) : (
              <>
                <div className="hero-featured-book hero-featured-book--1 hero-featured-book--fallback">
                  <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
                  <span>إصدارات دار الفتح</span>
                </div>
                <div className="hero-featured-book hero-featured-book--2 hero-featured-book--fallback">
                  <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
                  <span>كتب ورقية ورقمية</span>
                </div>
                <div className="hero-featured-book hero-featured-book--3 hero-featured-book--fallback">
                  <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
                  <span>اختيار آمن</span>
                </div>
              </>
            )}
          </div>

          <div className="hero-note-card">
            <b>اختيار النسخة قبل الشراء</b>
            <span>ورقي، رقمي، ومخزون واضح لكل كتاب.</span>
          </div>
        </div>
      </section>


      <section>
        <SectionHeader
          title="أحدث الكتب في الكتالوج"
          subtitle="كل كارت يعرض الصورة، المؤلف، التصنيف، وسعر البداية أو نطاق السعر"
          href="/books"
          linkLabel="عرض كل الكتب"
        />
        <div className="books-grid">
          {featuredProducts.map((product, i) => (
            <ProductCard
              key={product.product_id}
              product={product}
              index={i}
            />
          ))}
        </div>
      </section>

      {categorySections.slice(0, 3).map((entry) => (
        <section key={entry.category.id}>
          <SectionHeader
            title={entry.category.name}
            subtitle="كتب مختارة من هذا التصنيف"
            href={`/books?category=${entry.category.id}`}
            linkLabel="عرض التصنيف"
          />
          <div className="books-grid">
            {entry.products.map((product) => (
              <ProductCard key={product.product_id} product={product} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <SectionHeader title="دعم وتجربة قراءة" subtitle="فيديوهات تعريفية مختارة من قناتك على يوتيوب" />
        <div className="video-grid">{introVideos.map((video) => <VideoCard key={video.id} video={video} />)}</div>
      </section>

      <section className="features-grid">
        <FeatureCard title="دعم العملاء" description="فريق دار الفتح جاهز لمساعدتك في أي وقت قبل الشراء وبعده." icon={<Headphones size={18} />} />
        <FeatureCard title="أسعار حسب دولتك" description="العملة والأسعار تتكيف تلقائيًا حسب الدولة التي تختارها." icon={<CreditCard size={18} />} />
        <FeatureCard title="مخزون دقيق ومحدّث" description="عدد النسخ المتاحة يظهر لك قبل الشراء لضمان وصول طلبك." icon={<BookOpenText size={18} />} />
        <FeatureCard title="تسليم موثوق" description="نتعاون مع شركات شحن معتمدة لضمان وصول كتبك بأمان وسرعة." icon={<Truck size={18} />} />
      </section>
    </div>
  );
}
