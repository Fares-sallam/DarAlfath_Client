import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useStoreSettings } from '@/hooks/useStorefront';

export default function StoreLayout() {
  const { data: settings } = useStoreSettings();
  const safeSettings = settings ?? {
    store_name: 'دار الفتح للنشر والتوزيع',
    store_description: 'متجر عربي هادئ وفاخر لعرض وبيع الكتب الورقية والرقمية.',
    store_email: '',
    store_phone: '',
    store_address: '',
  };

  return (
    <div className="app-shell">
      <Header settings={safeSettings} />
      <main className="container page-shell"><Outlet /></main>
      <Footer settings={safeSettings} />
    </div>
  );
}
