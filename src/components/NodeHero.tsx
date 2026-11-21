import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { nodeHref } from '@/lib/nodePage';
import { parseVideo, type VideoEmbed } from '@/lib/videoEmbed';
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

/** Whether a node has anything to put at the top of its page (a welcome text or a video). */
export function hasNodeIntro(node: Pick<CatalogNode, 'intro_ar' | 'video_url'>): boolean {
  return Boolean(node.intro_ar?.trim()) || Boolean(parseVideo(node.video_url));
}

/**
 * The top of a series / section page: its name, the welcome text and the video the dashboard wrote for it, and a
 * way to the plain list of all its books. It is the page's heading (h1).
 */
export default function NodeHero({ node, total, showAllLink }: { node: CatalogNode; total: number; showAllLink: boolean }) {
  const video = parseVideo(node.video_url);
  const intro = (node.intro_ar?.trim() || node.description_ar?.trim() || '');
  const paragraphs = intro ? intro.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean) : [];

  return (
    <section
      className={`node-hero${video ? ' node-hero--with-video' : ''}${!video && paragraphs.length === 0 ? ' node-hero--plain' : ''}`}
      data-testid="node-hero"
    >
      <div className="node-hero__text">
        <h1>{node.name_ar}</h1>
        <p className="node-hero__count">{total} كتاب</p>
        {paragraphs.map((text, i) => <p className="node-hero__intro" key={i}>{text}</p>)}
        {showAllLink ? (
          <Link className="node-hero__all" to={`${nodeHref(node)}&view=all`}>عرض كل الكتب في قائمة واحدة</Link>
        ) : null}
      </div>
      {video ? <NodeVideo video={video} title={node.name_ar} /> : null}
    </section>
  );
}
