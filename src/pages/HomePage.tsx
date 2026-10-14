import { BookOpenText, CreditCard, Headphones, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import FeatureCard from '@/components/FeatureCard';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import ScrollRail from '@/components/ScrollRail';
import VideoCarousel from '@/components/VideoCarousel';
import HeroShowcase from '@/components/HeroShowcase';
import StoreDepartments from '@/components/StoreDepartments';
import PageCursorLight from '@/components/PageCursorLight';
import { OrnamentDivider } from '@/components/Ornament';
import { useReveal } from '@/hooks/useReveal';
import { useDiscountedProducts, useHomeCategorySections, useIntroVideos, useNewArrivals, useProducts } from '@/hooks/useStorefront';
import { siteOrigin, useSeo } from '@/hooks/useSeo';
import { staticSeo } from '@/lib/seo';

/** An offers row with one or two books in it looks unfinished: it appears from three on (the "offers only" filter works for any number). */
const MIN_OFFERS_ROW = 3;

/** Sections fade up as they arrive; the hook no-ops under reduced motion. */
function Reveal({ children, className = '', 'data-testid': testId }: { children: React.ReactNode; className?: string; 'data-testid'?: string }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`reveal ${className}`.trim()} data-testid={testId}>
      {children}
    </section>
  );
}

export default function HomePage() {
  useSeo(staticSeo('home', siteOrigin()));
  const { data: products = [] } = useProducts();
  const { data: categorySections = [] } = useHomeCategorySections();
  const { data: newArrivals = [] } = useNewArrivals(12);
  const { data: discounted = [] } = useDiscountedProducts();
  const { data: introVideoRows = [] } = useIntroVideos();

  const railProducts = products.slice(0, 12);
  const introVideos = introVideoRows.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description ?? '',
    youtubeUrl: v.youtube_url,
    duration: v.duration ?? '',
  }));

  return (
    <div className="page-sections page-sections--home">
      <PageCursorLight />

      {/* ── The hero: just the admin-uploaded banner, full width, nothing
             framing it. Renders nothing (and drops no space) until at least
             one slide exists in the dashboard. ── */}
      <section className="home-hero-section">
        <div className="home-hero-section__container">
          <HeroShowcase />
        </div>
      </section>

      {/* ── Quick-nav strip of department cards, right after the banner —
             see StoreDepartments.tsx for why these are book_series rows.
             Self-contains its own reveal-on-mount and empty state (renders
             nothing, drops no grid gap, until at least one series exists) —
             unlike the sections below, it isn't wrapped in <Reveal> here. ── */}
      <StoreDepartments />

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

      {/* ── What's new, and what is on offer. Both come from the catalog itself (the date a book was added,
             and a copy priced below its list price), so they fill and empty as the catalog does; a row with
             nothing to show is simply not drawn. ── */}
      {newArrivals.length > 0 && (
        <Reveal className="shelf-section" data-testid="new-arrivals">
          <SectionHeader title="وصل حديثًا" subtitle="أحدث إصدارات الدار" href="/books?sort=newest" linkLabel="عرض الكل" />
          <ScrollRail ariaLabel="وصل حديثًا" className="shelf-rail">
            {newArrivals.map((product, i) => (
              <div className="shelf-rail__item" key={product.product_id}>
                <ProductCard product={product} index={i} />
              </div>
            ))}
          </ScrollRail>
        </Reveal>
      )}

      {discounted.length >= MIN_OFFERS_ROW && (
        <Reveal className="shelf-section" data-testid="offers">
          <SectionHeader title="عروض وخصومات" subtitle="كتب بسعر أقل من سعرها المعتاد" href="/books?sale=1&sort=discount" linkLabel="عرض الكل" />
          <ScrollRail ariaLabel="عروض وخصومات" className="shelf-rail">
            {discounted.map((product, i) => (
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
          <VideoCarousel videos={introVideos} />
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
