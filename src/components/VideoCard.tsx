import type { VideoItem } from '@/types/store';

function toEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('v');
    if (v) return `https://www.youtube.com/embed/${v}`;
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').trim();
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return url;
  }
  return url;
}

export default function VideoCard({ video }: { video: VideoItem }) {
  return (
    <article className="video-card">
      <div className="video-card__frame">
        <iframe
          src={toEmbedUrl(video.youtubeUrl)}
          title={video.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <span className="video-card__duration">{video.duration}</span>
      </div>
      <div className="video-card__body">
        <h3>{video.title}</h3>
        <p>{video.description}</p>
      </div>
    </article>
  );
}
