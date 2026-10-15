import { useState } from 'react';
import { Play } from 'lucide-react';
import ScrollRail from '@/components/ScrollRail';
import type { VideoItem } from '@/types/store';

/** The video's id in any of the link shapes YouTube hands out (watch, youtu.be, embed, shorts). */
export function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('v');
    if (v) return v;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parsed.hostname.includes('youtu.be')) return parts[0] ?? null;
    const at = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
    return at >= 0 ? parts[at + 1] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * The house's videos on a shelf like the books: side by side, scrolled sideways. Each shows its picture
 * until it is played; only then is YouTube's player loaded, and only for that one (starting another
 * stops the first), so the home page doesn't pull in a player per video.
 */
export default function VideoRail({ videos, ariaLabel }: { videos: VideoItem[]; ariaLabel: string }) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (videos.length === 0) return null;

  return (
    <ScrollRail ariaLabel={ariaLabel} className="video-rail">
      {videos.map((video) => {
        const id = youtubeId(video.youtubeUrl);
        const isPlaying = playing === video.id || !id;
        return (
          <div className="video-rail__item" key={video.id}>
            <article className="video-tile">
              <div className="video-tile__frame">
                {isPlaying ? (
                  <iframe
                    src={id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : video.youtubeUrl}
                    title={video.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button
                    type="button"
                    className="video-tile__poster"
                    onClick={() => setPlaying(video.id)}
                    aria-label={`تشغيل ${video.title}`}
                  >
                    <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
                    <span className="video-tile__play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
                    {video.duration ? <span className="video-tile__duration">{video.duration}</span> : null}
                  </button>
                )}
              </div>
              <div className="video-tile__body">
                <h3 title={video.title}>{video.title}</h3>
                {video.description ? <p>{video.description}</p> : null}
              </div>
            </article>
          </div>
        );
      })}
    </ScrollRail>
  );
}
