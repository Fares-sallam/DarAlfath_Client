/**
 * What goes at the top of a series / section / category page, as the dashboard's «صفحات الأقسام» sets it: a video or a picture, a
 * welcome text, and how the text is set (alignment, size, side spacing, above / below / beside the picture or video). Pure.
 */
import type { CatalogNode } from '@/lib/catalogTree';
import { parseVideo, type VideoEmbed } from '@/lib/videoEmbed';

export type IntroNode = Pick<
  CatalogNode,
  'intro_ar' | 'description_ar' | 'video_url' | 'intro_media' | 'intro_image_url' | 'intro_align' | 'intro_font_px' | 'intro_pad_right' | 'intro_pad_left' | 'intro_text_pos'
>;

export type IntroMediaView = { kind: 'video'; video: VideoEmbed } | { kind: 'image'; url: string } | null;

/** A picture address the page may draw: https only (nothing else is ever put in an <img>). */
export function safeImageUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The picture or video to show: 'auto' keeps the old behaviour (a video when there is one, nothing otherwise). */
export function introMedia(node: Pick<IntroNode, 'video_url' | 'intro_media' | 'intro_image_url'>): IntroMediaView {
  const video = parseVideo(node.video_url);
  const image = safeImageUrl(node.intro_image_url);
  switch (node.intro_media) {
    case 'none': return null;
    case 'video': return video ? { kind: 'video', video } : null;
    case 'image': return image ? { kind: 'image', url: image } : null;
    default: return video ? { kind: 'video', video } : null;
  }
}

/** The welcome text (the page's own, or the node's description when it has none), as paragraphs. */
export function introParagraphs(node: Pick<IntroNode, 'intro_ar' | 'description_ar'>): string[] {
  const text = node.intro_ar?.trim() || node.description_ar?.trim() || '';
  return text ? text.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean) : [];
}

/** Whether a node has anything of its own to put at the top of its page (a welcome text written for it, a picture or a video). */
export function hasNodeIntro(node: IntroNode): boolean {
  return Boolean(node.intro_ar?.trim()) || introMedia(node) !== null;
}

export interface IntroLook {
  align: 'right' | 'center' | 'left';
  fontPx: number;
  padRight: number;
  padLeft: number;
  textPos: 'side' | 'above' | 'below';
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** How the text is set, every value held to what the page can draw (an unknown or missing one is the page's old look). */
export function introLook(node: Pick<IntroNode, 'intro_align' | 'intro_font_px' | 'intro_pad_right' | 'intro_pad_left' | 'intro_text_pos'>): IntroLook {
  return {
    align: node.intro_align === 'center' || node.intro_align === 'left' ? node.intro_align : 'right',
    fontPx: clamp(node.intro_font_px, 12, 40, 16),
    padRight: clamp(node.intro_pad_right, 0, 240, 0),
    padLeft: clamp(node.intro_pad_left, 0, 240, 0),
    textPos: node.intro_text_pos === 'above' || node.intro_text_pos === 'below' ? node.intro_text_pos : 'side',
  };
}
