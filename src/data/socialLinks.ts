import { Facebook, Globe, Instagram, MessageCircle, Youtube } from 'lucide-react';

export interface SocialLinkItem {
  name: string;
  url: string;
  icon: any;
}

// Empty on purpose (2026-08-23): every entry here used to be an unfilled
// placeholder (example.com, /your-page, a fake WhatsApp number) rendered
// live in the site footer on every page. Add real accounts back in as they
// exist — icons available: Globe, Facebook, Instagram, MessageCircle
// (WhatsApp), Youtube.
export const socialLinks: SocialLinkItem[] = [];
