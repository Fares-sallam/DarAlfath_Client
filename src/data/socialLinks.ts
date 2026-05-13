import { Facebook, Globe, Instagram, MessageCircle, Youtube } from 'lucide-react';

export interface SocialLinkItem {
  name: string;
  url: string;
  icon: any;
}

export const socialLinks: SocialLinkItem[] = [
  { name: 'الموقع الرسمي', url: 'https://example.com', icon: Globe },
  { name: 'فيسبوك', url: 'https://facebook.com/your-page', icon: Facebook },
  { name: 'إنستجرام', url: 'https://instagram.com/your-page', icon: Instagram },
  { name: 'واتساب', url: 'https://wa.me/201000000000', icon: MessageCircle },
  { name: 'يوتيوب', url: 'https://youtube.com/@your-channel', icon: Youtube },
];
