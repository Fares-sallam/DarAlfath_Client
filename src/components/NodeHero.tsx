import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { nodeHref } from '@/lib/nodePage';
import { introLook, introMedia, introParagraphs } from '@/lib/nodeIntro';
import { useNodePagePreview } from '@/lib/displayPreview';
import type { VideoEmbed } from '@/lib/videoEmbed';
import type { CatalogNode } from '@/lib/catalogTree';

/** The video the dashboard attached to a page: a picture first, the player only once it is played. */
function NodeVideo({ video, title }: { video: VideoEmbed; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (video.kind === 'link') {
    return (
      <a className="node-hero__video-link" href={video.url} target="_blank" rel="noopener noreferrer">
        <Play size={18} aria-hidden="true" /> شاهد الفيديو
      </a>
    );
  }
  return (
    <div className="node-hero__video" data-testid="node-video">
      {video.kind === 'file' ? (
        <video src={video.url} controls preload="metadata" title={title} />
      ) : playing || video.kind === 'vimeo' ? (
        <iframe
          src={video.kind === 'vimeo'
            ? `https://player.vimeo.com/video/${video.id}`
            : `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className="video-tile__poster" onClick={() => setPlaying(true)} aria-label={`تشغيل فيديو ${title}`}>
          <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
          <span className="video-tile__play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
        </button>
      )}
    </div>
  );
}

export { hasNodeIntro } from '@/lib/nodeIntro';

/**
 * The top of a series / section / category page: its name, the picture or video and the welcome text the dashboard wrote for it
 * (set as it chose: aligned right, centred or left, a size, side spacing, and the text above, below or beside the picture or
 * video), and a way to the plain list of all its books. It is the page's heading (h1).
 */
export default function NodeHero({ node, total, showAllLink }: { node: CatalogNode; total: number; showAllLink: boolean }) {
  // while the dashboard is editing this page, its draft is what is drawn
  const draft = useNodePagePreview(node.id);
  const shown = draft ? { ...node, ...draft } : node;
  const media = introMedia(shown);
  const paragraphs = introParagraphs(shown);
  const look = introLook(shown);
  const stacked = media !== null && look.textPos !== 'side';

  const text = (
    <div
      className="node-hero__text"
      data-align={look.align}
      style={{ paddingRight: look.padRight, paddingLeft: look.padLeft, ['--hero-size' as string]: `${look.fontPx}px` }}
      data-testid="node-hero-text"
    >
      <h1>{shown.name_ar}</h1>
      <p className="node-hero__count">{total} كتاب</p>
      {paragraphs.map((paragraph, i) => <p className="node-hero__intro" key={i}>{paragraph}</p>)}
      {showAllLink ? (
        <Link className="node-hero__all" to={`${nodeHref(shown)}&view=all`}>عرض كل الكتب في قائمة واحدة</Link>
      ) : null}
    </div>
  );
  const mediaBlock = media
    ? media.kind === 'video'
      ? <NodeVideo video={media.video} title={shown.name_ar} />
      : (
        <div className="node-hero__image" data-testid="node-image">
          <img src={media.url} alt={shown.name_ar} loading="lazy" decoding="async" />
        </div>
      )
    : null;

  return (
    <section
      className={`node-hero${media && !stacked ? ' node-hero--with-media node-hero--with-video' : ''}${stacked ? ' node-hero--stack' : ''}${!media && paragraphs.length === 0 ? ' node-hero--plain' : ''}`}
      data-testid="node-hero"
      data-text-pos={media ? look.textPos : 'none'}
    >
      {stacked && look.textPos === 'below' ? <>{mediaBlock}{text}</> : <>{text}{mediaBlock}</>}
    </section>
  );
}
