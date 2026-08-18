import { ArrowLeft, BookOpenText, CreditCard, Headphones, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import FeatureCard from '@/components/FeatureCard';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import ScrollRail from '@/components/ScrollRail';
import VideoCard from '@/components/VideoCard';
import Frontispiece from '@/components/Frontispiece';
import HeroShowcase from '@/components/HeroShowcase';
import PageCursorLight from '@/components/PageCursorLight';
import { OrnamentCorner, OrnamentDivider, OrnamentMedallion, OrnamentSideMark } from '@/components/Ornament';
import { useReveal } from '@/hooks/useReveal';
import { introVideos } from '@/data/introVideos';
import { useHomeCategorySections, useProducts, useStoreSettings } from '@/hooks/useStorefront';
import { usePageTitle } from '@/hooks/usePageTitle';

/** Sections fade up as they arrive; the hook no-ops under reduced motion. */
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`reveal ${className}`.trim()}>
      {children}
    </section>
  );
}

export default function HomePage() {
  usePageTitle();
  const { data: settings } = useStoreSettings();
  const { data: products = [] } = useProducts();
  const { data: categorySections = [] } = useHomeCategorySections(4);

  const railProducts = products.slice(0, 12);

  return (
    <div className="page-sections page-sections--home">
      <PageCursorLight />

      {/* ── Frontispiece: the title page of a manuscript, not a marketing hero.
             A ruled gold frame, the house name, one line, one action. ── */}
      <Frontispiece>
          <OrnamentCorner position="tl" />
          <OrnamentCorner position="tr" />
          <OrnamentCorner position="bl" />
          <OrnamentCorner position="br" />
          <OrnamentSideMark side="start" />
          <OrnamentSideMark side="end" />

          <div className="frontispiece__inner frontispiece__inner--showcase">
            <OrnamentMedallion />
            <p className="frontispiece__eyebrow">دار الفتح للنشر والتوزيع</p>

            <h1 className="frontispiece__title frontispiece__title--compact">
              كتبٌ تُقتنى، لا تُتصفّح فقط
            </h1>

            {/* The hero's actual focal point — admin-curated slides on
                pedestals. Renders nothing (and drops no space) until at
                least one slide exists in the dashboard. */}
            <HeroShowcase />

            <OrnamentDivider label="فاصل زخرفي" />

            <p className="frontispiece__lede">
              {settings?.store_description ||
                'إصدارات مختارة بعناية، تُعرض بوضوح: النسخة، السعر، والمتاح منها — قبل أن تقرر.'}
            </p>

            <div className="frontispiece__actions">
              <Link to="/books" className="primary-button">
                تصفّح الإصدارات
                <ArrowLeft size={16} />
              </Link>
              <Link to="/about" className="ghost-button">
                عن الدار
              </Link>
            </div>
          </div>
      </Frontispiece>

      {/* ── The shelf: horizontal, because a shelf is horizontal. Also the
             pattern the per-book galleries will reuse once books carry
             several images each. ── */}
      {railProducts.length > 0 && (
        <Reveal className="shelf-section">
          <SectionHeader
            title="من رفوف الدار"
            subtitle="مرّر لتستعرض الإصدارات"
            href="/books"
            linkLabel="عرض الكل"
          />
          <ScrollRail ariaLabel="إصدارات دار الفتح" className="shelf-rail">
            {railProducts.map((product, i) => (
              <div className="shelf-rail__item" key={product.product_id}>
                <ProductCard product={product} index={i} />
              </div>
            ))}
          </ScrollRail>
        </Reveal>
      )}

      <OrnamentDivider />

      {categorySections.slice(0, 3).map((entry) => (
        <Reveal key={entry.category.id}>
          <SectionHeader
            title={entry.category.name}
            subtitle="كتب مختارة من هذا التصنيف"
            href={`/books?category=${entry.category.id}`}
            linkLabel="عرض التصنيف"
          />
          <ScrollRail ariaLabel={entry.category.name} className="shelf-rail">
            {entry.products.map((product, i) => (
              <div className="shelf-rail__item" key={product.product_id}>
                <ProductCard product={product} index={i} />
              </div>
            ))}
          </ScrollRail>
        </Reveal>
      ))}

      {/* ── Who we are: this store hasn't launched, so a first visitor needs
             to know whose books these are before being asked to buy. ── */}
      <Reveal className="house-note">
        <div className="house-note__body">
          <p className="house-note__kicker">عن الدار</p>
          <h2>نَنشُر ما يستحق أن يُقرأ مرّتين</h2>
          <p>
            دار الفتح للنشر والتوزيع تختار إصداراتها بعناية، وتعرضها هنا كما هي: نسخة ورقية أو
            رقمية، سعر واضح، ومخزون معلوم قبل الطلب.
          </p>
          <Link to="/about" className="ghost-button">
            اقرأ المزيد
          </Link>
        </div>
      </Reveal>

      <OrnamentDivider />

      {introVideos.length > 0 && (
        <Reveal>
          <SectionHeader title="من الدار" subtitle="مقاطع تعريفية مختارة" />
          <div className="video-grid">
            {introVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </Reveal>
      )}

      <Reveal className="features-section">
        <div className="features-grid">
          <FeatureCard
            title="دعم العملاء"
            description="فريق دار الفتح جاهز لمساعدتك في أي وقت قبل الشراء وبعده."
            icon={<Headphones size={18} />}
          />
          <FeatureCard
            title="أسعار حسب دولتك"
            description="العملة والأسعار تتكيف تلقائيًا حسب الدولة التي تختارها."
            icon={<CreditCard size={18} />}
          />
          <FeatureCard
            title="مخزون دقيق ومحدّث"
            description="عدد النسخ المتاحة يظهر لك قبل الشراء لضمان وصول طلبك."
            icon={<BookOpenText size={18} />}
          />
          <FeatureCard
            title="تسليم موثوق"
            description="نتعاون مع شركات شحن معتمدة لضمان وصول كتبك بأمان وسرعة."
            icon={<Truck size={18} />}
          />
        </div>
      </Reveal>
    </div>
  );
}
