import FeatureCard from '@/components/FeatureCard';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import ScrollRail from '@/components/ScrollRail';
import VideoRail from '@/components/VideoRail';
import HeroShowcase from '@/components/HeroShowcase';
import StoreDepartments from '@/components/StoreDepartments';
import PageCursorLight from '@/components/PageCursorLight';
import { OrnamentDivider } from '@/components/Ornament';
import { useReveal } from '@/hooks/useReveal';
import {
  useBestSellers,
  useDiscountedProducts,
  useFeatureBoxes,
  useHomeCategorySections,
  useIntroVideos,
  useNewArrivals,
  useSiteContent,
} from '@/hooks/useStorefront';
import { featureIcon } from '@/lib/featureIcons';
import { siteOrigin, useSeo } from '@/hooks/useSeo';
import { staticSeo } from '@/lib/seo';

/** An offers row with one or two books in it looks unfinished: it appears from three on (the "offers only" filter works for any number). */
const MIN_OFFERS_ROW = 3;

/** The boxes above the footer, as they were before the dashboard managed them: shown only if those can't be read. */
const FALLBACK_FEATURES = [
  { id: 'support', title: 'دعم العملاء', description: 'فريق دار الفتح جاهز لمساعدتك في أي وقت قبل الشراء وبعده.', icon_key: 'headphones', image_url: null },
  { id: 'prices', title: 'أسعار حسب دولتك', description: 'العملة والأسعار تتكيف تلقائيًا حسب الدولة التي تختارها.', icon_key: 'credit-card', image_url: null },
  { id: 'stock', title: 'مخزون دقيق ومحدّث', description: 'عدد النسخ المتاحة يظهر لك قبل الشراء لضمان وصول طلبك.', icon_key: 'book-open-text', image_url: null },
  { id: 'delivery', title: 'تسليم موثوق', description: 'نتعاون مع شركات شحن معتمدة لضمان وصول كتبك بأمان وسرعة.', icon_key: 'truck', image_url: null },
];

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
  const { data: bestSellers } = useBestSellers();
  const { data: siteContent } = useSiteContent();
  const { data: featureRows, isError: featuresFailed } = useFeatureBoxes();
  const features = featuresFailed ? FALLBACK_FEATURES : featureRows ?? [];
  const { data: categorySections = [] } = useHomeCategorySections();
  const { data: newArrivals = [] } = useNewArrivals(12);
  const { data: discounted = [] } = useDiscountedProducts();
  const { data: introVideoRows = [] } = useIntroVideos();

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

      {/* ── Best sellers: the books picked in the dashboard (إدارة الإعلانات والأشرطة → الأكثر مبيعًا),
             where each book's sales are shown to choose by. Not drawn until some are picked. ── */}
      {bestSellers.length > 0 && (
        <Reveal className="shelf-section" data-testid="best-sellers">
          <SectionHeader title="الأكثر مبيعًا" subtitle="الكتب الأكثر طلبًا من قرّاء الدار" />
          <ScrollRail ariaLabel="الأكثر مبيعًا" className="shelf-rail">
            {bestSellers.map((product, i) => (
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

      {introVideos.length > 0 && (
        <Reveal>
          <SectionHeader title={siteContent?.intro_videos_title || 'فيديوهات تعريفية'} subtitle="مقاطع مختارة من دار الفتح" />
          <VideoRail videos={introVideos} ariaLabel={siteContent?.intro_videos_title || 'فيديوهات تعريفية'} />
        </Reveal>
      )}

      {features.length > 0 && (
        <Reveal className="features-section">
          <div className="features-grid" data-testid="feature-boxes">
            {features.map((box) => {
              const Icon = featureIcon(box.icon_key);
              return (
                <FeatureCard
                  key={box.id}
                  title={box.title}
                  description={box.description ?? ''}
                  icon={box.image_url ? <img src={box.image_url} alt="" loading="lazy" /> : <Icon size={18} />}
                />
              );
            })}
          </div>
        </Reveal>
      )}
    </div>
  );
}
