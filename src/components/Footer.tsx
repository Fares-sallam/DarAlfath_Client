import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import Logo from '@/components/Logo';
import { socialLinks } from '@/data/socialLinks';
import type { StoreSettings } from '@/types/store';

export default function Footer({ settings }: { settings: StoreSettings }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <Logo small />
          <p>ننشر المعرفة الهادفة ونبني جسرًا واسعًا من الكتب الأصيلة بين القارئ والعلم والثقافة والقيم.</p>

          <div className="site-footer__socials">
            {socialLinks.map((item) => {
              const Icon = item.icon;
              return <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}><Icon size={18} /></a>;
            })}
          </div>
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
