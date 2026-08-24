import { Link } from 'react-router-dom';
import { Facebook, Globe, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
import Logo from '@/components/Logo';
import type { StoreSettings } from '@/types/store';

export default function Footer({ settings }: { settings: StoreSettings }) {
  // Admin-editable from the dashboard (الإعدادات → روابط التواصل الاجتماعي)
  // instead of hardcoded — only entries an admin actually filled in render,
  // so there's never a placeholder/dead link live on the site.
  const socialLinks = [
    { name: 'الموقع الرسمي', url: settings.website_url, icon: Globe },
    { name: 'فيسبوك', url: settings.facebook_url, icon: Facebook },
    { name: 'إنستجرام', url: settings.instagram_url, icon: Instagram },
    { name: 'واتساب', url: settings.whatsapp_url, icon: MessageCircle },
    { name: 'يوتيوب', url: settings.youtube_url, icon: Youtube },
  ].filter((item): item is typeof item & { url: string } => !!item.url);

  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <Logo small />
          <p>ننشر المعرفة الهادفة ونبني جسرًا واسعًا من الكتب الأصيلة بين القارئ والعلم والثقافة والقيم.</p>

          {socialLinks.length > 0 && (
            <div className="site-footer__socials">
              {socialLinks.map((item) => {
                const Icon = item.icon;
                return <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}><Icon size={18} /></a>;
              })}
            </div>
          )}
        </div>

        <div>
          <h3>روابط سريعة</h3>
          <div className="site-footer__links">
            <Link to="/">الرئيسية</Link>
            <Link to="/books">الكتب</Link>
            <Link to="/about">عنّا</Link>
            <Link to="/policies">سياستنا</Link>
            <Link to="/contact">تواصل معنا</Link>
          </div>
        </div>

        <div>
          <h3>خدمة العملاء</h3>
          <div className="site-footer__links">
            <Link to="/account/orders">تتبع الطلب</Link>
            <Link to="/wishlist">قائمة المفضلة</Link>
            <Link to="/cart">السلة</Link>
            <Link to="/account">حسابي</Link>
          </div>
        </div>

        <div>
          <h3>بيانات التواصل</h3>
          <div className="site-footer__contact">
            <div><Phone size={16} /><span>{settings.store_phone || '—'}</span></div>
            <div><Mail size={16} /><span>{settings.store_email || '—'}</span></div>
            <div><MapPin size={16} /><span>{settings.store_address || '—'}</span></div>
          </div>
        </div>
      </div>

      <div className="container site-footer__bottom">
        <span>جميع الحقوق محفوظة © 2026 دار الفتح</span>
        <span>صُنع بعناية ليقدم تجربة عربية هادئة وفاخرة.</span>
      </div>
    </footer>
  );
}
