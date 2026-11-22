import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import AnnouncementBar from '@/components/AnnouncementBar';
import CategoryBar from '@/components/CategoryBar';
import Footer from '@/components/Footer';
import AppearanceStyle from '@/components/AppearanceStyle';
import DisplayStyle from '@/components/DisplayStyle';
import DisplayPreviewBridge from '@/components/DisplayPreviewBridge';
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
      <AppearanceStyle />
      <DisplayStyle />
      <DisplayPreviewBridge />
      <Header settings={safeSettings} />
      <AnnouncementBar />
      <CategoryBar />
      <main className="container page-shell"><Outlet /></main>
      <Footer settings={safeSettings} />
    </div>
  );
}
