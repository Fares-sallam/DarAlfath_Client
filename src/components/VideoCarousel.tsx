import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import VideoCard from '@/components/VideoCard';
import type { VideoItem } from '@/types/store';

const AUTO_ADVANCE_MS = 10000;
const FADE_MS = 420;

/**
 * One video visible at a time, auto-advancing every 10s (same interval and
 * pause-on-hover/fade behaviour as HeroShowcase — same site language,
 * different content). Unlike the hero's single persistent <img> crossfade,
 * each slide here is a full VideoCard with its own iframe, so a slide
 * change fades the wrapper out, swaps content, then fades back in rather
 * than crossfading one continuous node.
 */
export default function VideoCarousel({ videos }: { videos: VideoItem[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>();

  const count = videos.length;

  const goTo = (next: number) => {
    setVisible(false);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setIndex(next);
      setVisible(true);
    }, FADE_MS);
  };

  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setTimeout(() => goTo((index + 1) % count), AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused, index]);

  if (count === 0) return null;

  const video = videos[index];

  return (
    <div
      className="video-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="video-carousel__stage">
        {count > 1 && (
          <button
            type="button"
            className="home-hero-panel__nav home-hero-panel__nav--prev"
            onClick={() => goTo((index - 1 + count) % count)}
            aria-label="الفيديو السابق"
          >
            <ChevronRight size={18} />
          </button>
        )}

        <div className={`video-carousel__slide${visible ? '' : ' video-carousel__slide--fading'}`}>
          <VideoCard key={video.id} video={video} />
        </div>

        {count > 1 && (
          <button
            type="button"
            className="home-hero-panel__nav home-hero-panel__nav--next"
            onClick={() => goTo((index + 1) % count)}
            aria-label="الفيديو التالي"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="home-hero-panel__dots" role="tablist" aria-label="الفيديوهات">
          {videos.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`الفيديو ${i + 1}`}
              className={`home-hero-panel__dot${i === index ? ' home-hero-panel__dot--active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
