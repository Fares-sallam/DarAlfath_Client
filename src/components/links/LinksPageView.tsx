import { useEffect, useRef, useState, type AnchorHTMLAttributes, type CSSProperties, type MouseEvent } from 'react';
import { Check, ChevronLeft, Clock, Copy, Moon, Sun } from 'lucide-react';
import { LinkIcon } from './linkIcons';
import {
  classifyUrl, endsLabel, groupBlocks, isImageUrl, isLive, resolveLook, sortBlocks,
  type DividerLength, type DividerType, type LinksBlock, type LinksPageSettings,
} from '@/lib/linksPage';
import './linksPage.css';

/* The company links page, drawn from its settings and blocks. Used by the store (/links) and by the
   dashboard's live preview (إدارة الصفحة والروابط). It brings its own palette, fonts and spacing
   (linksPage.css, every class starts with lp-) so both draw it the same way.
   Kept identical in both repos. */

const SITE_NAME = 'دار الفتح للنشر والتوزيع';

export type LinksTheme = 'light' | 'dark';

interface Ctx {
  /** The dashboard's preview: nothing navigates, nothing animates in. */
  preview: boolean;
  /** Moves inside the store without a page load. Absent: an ordinary link. */
  onNavigate?: (to: string) => void;
}

/** The attributes of an <a> for a saved address, or null when it is not one the page will draw. */
function linkProps(url: string | null, newTab: boolean | null, ctx: Ctx): AnchorHTMLAttributes<HTMLAnchorElement> | null {
  const target = classifyUrl(url);
  if (!target) return null;
  const openable = target.kind === 'external' || target.kind === 'internal';
  const openNew = openable && (newTab ?? target.kind === 'external');
  const props: AnchorHTMLAttributes<HTMLAnchorElement> = { href: target.href };
  if (openNew) {
    props.target = '_blank';
    props.rel = 'noopener noreferrer';
  }
  props.onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (ctx.preview) {
      event.preventDefault();
      return;
    }
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (target.kind === 'internal' && !openNew && ctx.onNavigate && plain) {
      event.preventDefault();
      ctx.onNavigate(target.href);
    }
  };
  return props;
}

/* ── The house pattern, as it is drawn on the store's section dividers ───────────────────── */

const UNIT_PITCH = 56.7;

function PatternMark({ units }: { units: number }) {
  return (
    <svg className="lp-mark" viewBox={`10 0 ${61 + UNIT_PITCH * (units - 1)} 68`} aria-hidden="true" focusable="false">
      {Array.from({ length: units }, (_, i) => (
        <g key={i} transform={`translate(${i * UNIT_PITCH} 0)`}>
          <path fill="currentColor" d="M 14.25 1.5 L 27.47 1.5 C 27.47 1.5 21.66 19.94 39.74 34.1 C 39.74 34.1 11.01 27.72 14.25 1.5 Z" />
          <path className="lp-mark__accent" d="M 66.55 1.5 L 53.33 1.5 C 53.33 1.5 59.14 19.94 41.06 34.1 C 41.06 34.1 69.79 27.72 66.55 1.5 Z" />
          <path fill="currentColor" d="M 65.55 66.7 L 52.33 66.7 C 52.33 66.7 58.15 48.26 40.06 34.1 C 45.25 35.25 68.94 39.33 65.55 66.7 Z" />
          <path fill="currentColor" d="M 14.25 66.7 L 27.47 66.7 C 27.47 66.7 21.66 48.26 39.74 34.1 C 39.74 34.1 11.01 40.48 14.25 66.7 Z" />
        </g>
      ))}
    </svg>
  );
}

/** Both drawings are in the page (the theme is an attribute, switched in CSS); the one that is hidden is only fetched if it is ever shown. */
function Lockup({ theme }: { theme: LinksTheme }) {
  return (
    <div className="lp-logo">
      <img className="lp-logo__img lp-logo__img--day" src="/branding/logo-horizontal.svg" alt={SITE_NAME} width={3214} height={850} loading={theme === 'light' ? 'eager' : 'lazy'} />
      <img className="lp-logo__img lp-logo__img--night" src="/branding/logo-horizontal-dark.svg" alt={SITE_NAME} width={3214} height={850} loading={theme === 'dark' ? 'eager' : 'lazy'} />
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────────────────────── */

export function Divider({ type, length }: { type: DividerType; length: DividerLength }) {
  const cls = `lp-divider lp-divider--${type} lp-len-${length}`;
  if (type === 'pattern' || type === 'ornament') {
    return (
      <div className={cls} role="separator">
        <span className="lp-divider__rule" />
        <PatternMark units={type === 'pattern' ? 3 : 1} />
        <span className="lp-divider__rule lp-divider__rule--end" />
      </div>
    );
  }
  return <div className={cls} role={type === 'space' ? undefined : 'separator'} aria-hidden={type === 'space' ? true : undefined} />;
}

function CouponChip({ code, preview }: { code: string; preview: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (!preview) {
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        const box = document.createElement('textarea');
        box.value = code;
        box.style.position = 'fixed';
        box.style.opacity = '0';
        document.body.appendChild(box);
        box.select();
        try { document.execCommand('copy'); } catch { /* nothing more to try */ }
        box.remove();
      }
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="lp-coupon">
      <span className="lp-coupon__label">كود الخصم</span>
      <code className="lp-coupon__code">{code}</code>
      <button type="button" className="lp-coupon__btn" onClick={copy} aria-live="polite">
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {copied ? 'تم النسخ' : 'نسخ'}
      </button>
    </div>
  );
}

function BlockView({ block, ctx }: { block: LinksBlock; ctx: Ctx }) {
  const look = resolveLook(block.kind, block.look);

  switch (block.kind) {
    case 'link': {
      const props = linkProps(block.url, look.newTab, ctx);
      if (!props) return null;
      const hasIcon = !!block.icon;
      return (
        <a {...props} className={`lp-btn lp-c-${look.style}${hasIcon ? '' : ' lp-btn--plain'}`}>
          {hasIcon && <span className="lp-btn__icon"><LinkIcon name={block.icon} size={22} /></span>}
          <span className="lp-btn__text">
            <span className="lp-btn__title">{block.title}</span>
            {block.body && <span className="lp-btn__sub">{block.body}</span>}
          </span>
          {block.badge && <span className="lp-badge">{block.badge}</span>}
          {hasIcon && <ChevronLeft className="lp-btn__arrow" size={18} aria-hidden="true" />}
          {props.target === '_blank' && <span className="lp-sr"> (يفتح في تبويب جديد)</span>}
        </a>
      );
    }

    case 'offer': {
      const props = linkProps(block.url, look.newTab, ctx);
      return (
        <article className={`lp-offer lp-c-${look.style}`}>
          {isImageUrl(block.image_url) && <img className="lp-offer__img" src={block.image_url!} alt="" loading="lazy" decoding="async" />}
          <div className="lp-offer__body">
            {(block.badge || block.icon) && (
              <div className="lp-offer__top">
                {block.badge && <span className="lp-badge lp-badge--solid">{block.badge}</span>}
                {block.icon && <span className="lp-offer__icon"><LinkIcon name={block.icon} size={20} /></span>}
              </div>
            )}
            <h2 className="lp-offer__title">{block.title}</h2>
            {block.body && <p className="lp-offer__text">{block.body}</p>}
            {block.coupon_code && <CouponChip code={block.coupon_code} preview={ctx.preview} />}
            {look.showEnd && block.ends_at && (
              <p className="lp-offer__ends"><Clock size={14} aria-hidden="true" />{endsLabel(block.ends_at)}</p>
            )}
            {props && (
              <a {...props} className={`lp-btn lp-btn--cta lp-c-${look.style} lp-btn--plain`}>
                <span className="lp-btn__text"><span className="lp-btn__title">{block.cta_label || 'تفاصيل العرض'}</span></span>
                {props.target === '_blank' && <span className="lp-sr"> (يفتح في تبويب جديد)</span>}
              </a>
            )}
          </div>
        </article>
      );
    }

    case 'image': {
      if (!isImageUrl(block.image_url)) return null;
      const props = linkProps(block.url, look.newTab, ctx);
      const img = <img className="lp-image__img" src={block.image_url!} alt={block.title} loading="lazy" decoding="async" />;
      return (
        <figure className="lp-image">
          {props ? <a {...props} className="lp-image__link">{img}</a> : img}
          {look.showCaption && block.title && <figcaption>{block.title}</figcaption>}
        </figure>
      );
    }

    case 'heading':
      return block.title.trim() ? <h2 className={`lp-heading lp-align-${look.align} lp-size-${look.size}`}><span>{block.title}</span></h2> : null;

    case 'text':
      return block.body.trim() ? <p className={`lp-text lp-align-${look.align} lp-size-${look.size}`}>{block.body}</p> : null;

    case 'divider':
      return <Divider type={look.dividerType} length={look.dividerLength} />;
  }
}

/* ── The page ─────────────────────────────────────────────────────────────────────────────── */

interface Props {
  settings: LinksPageSettings;
  blocks: LinksBlock[];
  theme: LinksTheme;
  /** Given, a small day/night switch is drawn in the corner. */
  onToggleTheme?: () => void;
  preview?: boolean;
  onNavigate?: (to: string) => void;
  now?: Date;
}

function rootClass(settings: LinksPageSettings, preview: boolean) {
  return [
    'lp-root',
    `lp-shape-${settings.button_shape}`,
    settings.background === 'pattern' && 'lp-bg-pattern',
    preview && 'lp-root--preview',
  ].filter(Boolean).join(' ');
}

export default function LinksPageView({ settings, blocks, theme, onToggleTheme, preview = false, onNavigate, now }: Props) {
  const ctx: Ctx = { preview, onNavigate };
  const items = groupBlocks(sortBlocks(blocks).filter((b) => isLive(b, now ?? new Date())));
  const hasTitle = settings.title.trim() !== '';

  return (
    <div className={rootClass(settings, preview)} data-lp-theme={theme} dir="rtl" lang="ar">
      <div className="lp-wash" aria-hidden="true" />
      {onToggleTheme && (
        <button type="button" className="lp-theme" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'التبديل إلى المظهر الفاتح' : 'التبديل إلى المظهر الليلي'}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      )}

      <div className="lp-col">
        <header className="lp-header">
          {settings.show_logo && <Lockup theme={theme} />}
          <h1 className={hasTitle ? 'lp-title' : 'lp-sr'}>{hasTitle ? settings.title.trim() : SITE_NAME}</h1>
          {settings.tagline.trim() && <p className="lp-tagline">{settings.tagline.trim()}</p>}
        </header>

        <main className="lp-list">
          {items.length === 0 && <p className="lp-empty">مفيش روابط معروضة دلوقتي.</p>}
          {items.map((item, i) => (
            <div className="lp-item" style={{ '--i': Math.min(i, 12) } as CSSProperties} key={item.key}>
              {item.type === 'icons' ? (
                <div className="lp-icons">
                  {item.blocks.map((b) => {
                    const look = resolveLook('link', b.look);
                    const props = linkProps(b.url, look.newTab, ctx);
                    if (!props) return null;
                    return (
                      <a {...props} key={b.id} className={`lp-iconbtn lp-c-${look.style}`} aria-label={b.title} title={b.title}>
                        <LinkIcon name={b.icon ?? 'link'} size={24} />
                      </a>
                    );
                  })}
                </div>
              ) : (
                <BlockView block={item.block} ctx={ctx} />
              )}
            </div>
          ))}
        </main>

        <footer className="lp-footer">
          <div className="lp-frieze" aria-hidden="true" />
          {settings.footer_text.trim() && <p>{settings.footer_text.trim()}</p>}
        </footer>
      </div>
    </div>
  );
}

/** What shows while the page's content is on its way: the header, then bars where the buttons will be. */
export function LinksPageSkeleton({ theme }: { theme: LinksTheme }) {
  return (
    <div className="lp-root lp-shape-rounded lp-bg-pattern" data-lp-theme={theme} dir="rtl" lang="ar" aria-busy="true">
      <div className="lp-wash" aria-hidden="true" />
      <div className="lp-col">
        <header className="lp-header"><Lockup theme={theme} /></header>
        <div className="lp-list" aria-hidden="true">
          <div className="lp-skel" /><div className="lp-skel" /><div className="lp-skel" />
        </div>
      </div>
    </div>
  );
}

/** The page switched off from the dashboard. */
export function LinksPageClosed({ theme, onNavigate }: { theme: LinksTheme; onNavigate?: (to: string) => void }) {
  return (
    <div className="lp-root lp-shape-rounded lp-bg-pattern" data-lp-theme={theme} dir="rtl" lang="ar">
      <div className="lp-wash" aria-hidden="true" />
      <div className="lp-col">
        <header className="lp-header">
          <Lockup theme={theme} />
          <h1 className="lp-title">الصفحة غير متاحة دلوقتي</h1>
          <p className="lp-tagline">بنحدّث الصفحة وهترجع قريب. تقدر تزور المتجر في الأثناء.</p>
        </header>
        <div className="lp-list">
          <a
            className="lp-btn lp-btn--plain lp-c-primary"
            href="/"
            onClick={(e) => {
              if (onNavigate && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                onNavigate('/');
              }
            }}
          >
            <span className="lp-btn__text"><span className="lp-btn__title">زيارة المتجر</span></span>
          </a>
        </div>
      </div>
    </div>
  );
}
