import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import FeatureCard from '@/components/FeatureCard';
import ProductCard from '@/components/ProductCard';
import SectionHeader from '@/components/SectionHeader';
import ScrollRail from '@/components/ScrollRail';
import VideoRail from '@/components/VideoRail';
import HeroShowcase from '@/components/HeroShowcase';
import HomePromoBlock from '@/components/HomePromoBlock';
import StoreDepartments from '@/components/StoreDepartments';
import PageCursorLight from '@/components/PageCursorLight';
import { OrnamentDivider } from '@/components/Ornament';
import { useReveal } from '@/hooks/useReveal';
import { useAppearance } from '@/hooks/useAppearance';
import type { HomeSectionKey } from '@/lib/appearance';
import {
  useBestSellers,
  useCatalogVariants,
  useDiscountedProducts,
  useFeatureBoxes,
  useHomeCategorySections,
  useIntroVideos,
  useNewArrivals,
  useSiteContent,
} from '@/hooks/useStorefront';
import { featureIcon } from '@/lib/featureIcons';
import { useHomeLayoutRows, useHomeShelfSections, useWebTree } from '@/hooks/useCatalogTree';
import { useCountry } from '@/contexts/CountryContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { DEFAULT_LOOK, blockStatus, blockText, hasHomeLayout, lookOf, resolveHomeBlocks, type BlockLook, type HomeBlockKey, type LiveContext } from '@/lib/homeBlocks';
import { isPreviewMode, startPreviewBridge, usePreview } from '@/lib/homePreview';
import { webHrefForAppLink } from '@/lib/homeLink';
import { SHELF_KIND } from '@/lib/homeShelves';
import { buildCustomBlocks } from '@/lib/webCatalog';
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

/** The band behind a block, as a class (none = no band). */
const bandClass = (look: BlockLook) => (look.background === 'none' ? '' : ` home-band home-band--${look.background}`);

/** Sections fade up as they arrive; the hook no-ops under reduced motion. */
function Reveal({ children, className = '', 'data-testid': testId, blockKey }: { children: React.ReactNode; className?: string; 'data-testid'?: string; blockKey?: string }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`reveal ${className}`.trim()} data-testid={testId} data-block-key={blockKey}>
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
  const chosen = useHomeShelfSections();
  // The page's blocks in the order, titles and counts the dashboard's «الصفحة الرئيسية» sets. Until that has been read, or when it
  // can't be, the older order from «مظهر المتجر» is followed, with the standard texts and counts.
  const layout = useHomeLayoutRows();
  const layoutRows = useMemo(() => layout.data ?? [], [layout.data]);
  const layoutOn = hasHomeLayout(layoutRows);
  const blocks = useMemo(() => resolveHomeBlocks(layoutRows), [layoutRows]);
  // When and for whom each block shows: its dates, the visitor's country, phone or computer.
  const { selectedCountry } = useCountry();
  const realNow = useNow();
  const preview = usePreview();
  const now = preview.now ?? realNow;
  // on the dashboard's preview page: take the rows it sends, ignore links
  useEffect(() => (isPreviewMode() ? startPreviewBridge() : undefined), []);
  const onPhone = useMediaQuery('(max-width: 760px)');
  const live = useMemo<LiveContext>(
    () => ({ now, country: selectedCountry?.code ?? null, device: onPhone ? 'mobile' : 'desktop' }),
    [now, selectedCountry?.code, onPhone],
  );
  // The blocks the owner added (hand-picked books, a rule shelf, a promo strip), ready to draw.
  const tree = useWebTree();
  const { data: copiesByBook } = useCatalogVariants();
  const digitalIds = useMemo(() => {
    if (!copiesByBook) return null;
    const ids = new Set<string>();
    for (const [bookId, copies] of copiesByBook) if (copies.some((c) => c.is_digital)) ids.add(bookId);
    return ids;
  }, [copiesByBook]);
  const customViews = useMemo(
    () => buildCustomBlocks(blocks, tree.nodes, tree.links, tree.products, digitalIds),
    [blocks, tree.nodes, tree.links, tree.products, digitalIds],
  );
  const textOf = (key: HomeSectionKey) => blockText(layoutOn ? blocks.find((b) => b.std === key) : undefined, key);
  const { data: newArrivals = [] } = useNewArrivals(textOf('new-arrivals').limit ?? 12);
  const { data: discounted = [] } = useDiscountedProducts();
  const { data: introVideoRows = [] } = useIntroVideos();

  const introVideos = introVideoRows.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description ?? '',
    youtubeUrl: v.youtube_url,
    duration: v.duration ?? '',
  }));

  /** The look of a standard block (the standard look when the page follows the older order, which has none). */
  const lookOfStd = (key: HomeBlockKey): BlockLook => (layoutOn ? lookOf(blocks.find((b) => b.std === key)?.config) : DEFAULT_LOOK);

  const shelf = (
    key: string, title: string, subtitle: string, items: typeof bestSellers,
    extra: { href?: string; linkLabel?: string; linkKind?: 'view_all' | 'view_category'; testId?: string; look?: BlockLook; blockKey?: string },
  ) => {
    const look = extra.look ?? DEFAULT_LOOK;
    // the owner can name the link, point it at another page of the app (the website opens the matching page) or hide it
    const href = (look.linkUrl ? webHrefForAppLink(look.linkUrl, tree.nodes) : null) ?? extra.href;
    const showLink = !look.linkHidden && Boolean(href);
    return (
      <Reveal key={key} className={`shelf-section${bandClass(look)}`} data-testid={extra.testId} blockKey={extra.blockKey ?? key}>
        <SectionHeader title={title} subtitle={subtitle} href={showLink ? href : undefined} linkLabel={look.linkLabel ?? extra.linkLabel} linkKind={extra.linkKind} />
        {look.layout === 'grid' ? (
          <div className="shelf-grid" data-testid="shelf-grid">
            {items.map((product, i) => (
              <div className="shelf-grid__item" key={product.product_id}>
                <ProductCard product={product} index={i} />
              </div>
            ))}
          </div>
        ) : (
          <ScrollRail ariaLabel={title} className="shelf-rail">
            {items.map((product, i) => (
              <div className="shelf-rail__item" key={product.product_id}>
                <ProductCard product={product} index={i} />
              </div>
            ))}
          </ScrollRail>
        )}
      </Reveal>
    );
  };

  const { appearance } = useAppearance();
  // `group` is the dashboard's name for the row («صفوف التصنيفات» covers every category row at once).
  const sections: { key: string; group: HomeSectionKey; node: ReactNode }[] = [];
  if (bestSellers.length > 0) {
    const t = textOf('best-sellers');
    sections.push({ key: 'best-sellers', group: 'best-sellers', node: shelf('best-sellers', t.title, t.subtitle ?? '', t.limit != null ? bestSellers.slice(0, t.limit) : bestSellers, { testId: 'best-sellers', look: lookOfStd('best-sellers') }) });
  }
  if (newArrivals.length > 0) {
    const t = textOf('new-arrivals');
    sections.push({ key: 'new-arrivals', group: 'new-arrivals', node: shelf('new-arrivals', t.title, t.subtitle ?? '', newArrivals, { href: '/books?sort=newest', linkLabel: 'عرض الكل', testId: 'new-arrivals', look: lookOfStd('new-arrivals') }) });
  }
  if (discounted.length >= MIN_OFFERS_ROW) {
    const t = textOf('offers');
    sections.push({ key: 'offers', group: 'offers', node: shelf('offers', t.title, t.subtitle ?? '', t.limit != null ? discounted.slice(0, t.limit) : discounted, { href: '/books?sale=1&sort=discount', linkLabel: 'عرض الكل', testId: 'offers', look: lookOfStd('offers') }) });
  }
  // The category shelves. With the dashboard's layout they are blocks of their own, each where it was put (and the automatic
  // «first N categories» block steps aside once any is chosen). Without it: the chosen ones, or the first three categories as
  // the page always had them, all at the place of «صفوف التصنيفات». Nothing is drawn until it is known which.
  const hasShelfRows = layoutRows.some((r) => r.kind === 'category-shelf');
  const autoCount = textOf('categories').limit ?? 3;
  const autoShelves = categorySections.slice(0, autoCount).map((entry) => ({
    key: `category-${entry.category.id}`,
    title: entry.category.name,
    subtitle: 'كتب مختارة من هذا التصنيف',
    href: `/books?category=${entry.category.id}`,
    books: entry.products,
  }));
  const shelfNode = (entry: { key: string; title: string; subtitle: string; href: string; books: typeof bestSellers }, look: BlockLook, blockKey: string) =>
    shelf(entry.key, entry.title, entry.subtitle, entry.books, { href: entry.href, linkLabel: 'عرض التصنيف', linkKind: 'view_category', look, blockKey });
  const categoryShelves = chosen.loading ? [] : layoutOn ? (hasShelfRows ? [] : autoShelves) : chosen.shelves ?? autoShelves;
  for (const entry of categoryShelves) {
    sections.push({ key: entry.key, group: 'categories', node: shelfNode(entry, { ...lookOfStd('categories'), linkUrl: null }, 'categories') });
  }
  // the videos' title: written here, else the one from the videos' own settings, else the standard
  const videosTitle = (layoutOn ? blocks.find((b) => b.std === 'intro-videos')?.title : null) || siteContent?.intro_videos_title || 'فيديوهات تعريفية';
  if (introVideos.length > 0) {
    sections.push({
      key: 'intro-videos',
      group: 'intro-videos',
      node: (
        <Reveal key="intro-videos" className={bandClass(lookOfStd('intro-videos')).trim()} blockKey="intro-videos">
          <SectionHeader title={videosTitle} subtitle={textOf('intro-videos').subtitle ?? ''} />
          <VideoRail videos={introVideos} ariaLabel={videosTitle} />
        </Reveal>
      ),
    });
  }
  if (features.length > 0) {
    sections.push({
      key: 'features',
      group: 'features',
      node: (
        <Reveal key="features" className={`features-section${bandClass(lookOfStd('features'))}`} blockKey="features">
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
      ),
    });
  }

  sections.unshift({ key: 'departments', group: 'departments', node: <StoreDepartments key="departments" title={textOf('departments').title} blockKey="departments" /> });
  // The dashboard's order and which blocks show; rows the catalog has nothing for are skipped as before.
  const shelfByKey = new Map((chosen.shelves ?? []).map((view) => [view.key, view]));
  type Entry = { key: string; group: string; node: ReactNode; divider: 'auto' | 'none' };
  const entry = (key: string, group: string, node: ReactNode, look: BlockLook): Entry => ({ key, group, node, divider: look.divider });
  const ordered: Entry[] = layout.isLoading
    ? []
    : layoutOn
      ? blocks
          .filter((block) => blockStatus(block, live).live)
          .flatMap((block): Entry[] => {
            const look = lookOf(block.config);
            if (block.std !== null) return sections.filter((section) => section.group === block.std).map((section) => entry(section.key, section.group, section.node, look));
            if (block.kind === SHELF_KIND) {
              const view = shelfByKey.get(block.key);
              return view ? [entry(block.key, 'categories', shelfNode(view, look, block.key), look)] : [];
            }
            const view = customViews.get(block.key);
            if (!view) return [];
            if (view.type === 'promo') {
              return [entry(block.key, 'custom', (
                <Reveal key={block.key} data-testid="custom-promo" blockKey={block.key}>
                  <HomePromoBlock title={view.title} text={view.text} imageUrl={view.imageUrl} href={view.href} buttonLabel={view.buttonLabel} tone={view.tone} />
                </Reveal>
              ), look)];
            }
            return [entry(block.key, 'custom', shelf(view.key, view.title, view.subtitle, view.books, {
              href: view.href ?? undefined, linkLabel: 'عرض الكل', testId: `custom-${view.kind}`, look, blockKey: block.key,
            }), look)];
          })
      : appearance.home_sections
          .filter((setting) => setting.visible)
          .flatMap((setting) => sections.filter((section) => section.group === setting.key).map((section) => entry(section.key, section.group, section.node, DEFAULT_LOOK)));

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
      {/* (the series strip is one of the sections below, so the dashboard can move or hide it) */}

      {/* ── The shelves, one after another with the pattern between each: the books picked in the dashboard
             as best sellers (إدارة الإعلانات والأشرطة → الأكثر مبيعًا), what's new and what is on offer (both
             come from the catalog itself, so they fill and empty as it does), a row per category, the intro
             videos, and the boxes above the footer. A row with nothing to show is not drawn, and no divider
             is left standing beside it. ── */}
      {ordered.map((section, i) => (
        <Fragment key={section.key}>
          {/* the series strip sits tight to its neighbours, as it always did: no divider on either side of it */}
          {i > 0 && section.divider !== 'none' && section.group !== 'departments' && ordered[i - 1].group !== 'departments' && <OrnamentDivider seed={i + 3} />}
          {section.node}
        </Fragment>
      ))}
    </div>
  );
}
