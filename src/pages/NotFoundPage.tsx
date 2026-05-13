import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page-card">
      <h1>الصفحة غير موجودة</h1>
      <p>الرابط الذي فتحته غير متاح داخل المتجر.</p>
      <Link to="/" className="primary-button">العودة للرئيسية</Link>
    </div>
  );
}
