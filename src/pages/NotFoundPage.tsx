import { Link, useLocation } from 'react-router-dom';
import { usePrivateSeo } from '@/hooks/useSeo';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  usePrivateSeo('الصفحة غير موجودة', pathname);
  return (
    <div className="page-card">
      <h1>الصفحة غير موجودة</h1>
      <p>الرابط الذي فتحته غير متاح داخل المتجر.</p>
      <Link to="/" className="primary-button">العودة للرئيسية</Link>
    </div>
  );
}
