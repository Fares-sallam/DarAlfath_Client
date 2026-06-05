import { Route, Routes } from 'react-router-dom';
import ScrollToTop from '@/components/ScrollToTop';
import StoreLayout from '@/components/StoreLayout';
import HomePage from '@/pages/HomePage';
import BooksPage from '@/pages/BooksPage';
import CategoriesPage from '@/pages/CategoriesPage';
import BookDetailsPage from '@/pages/BookDetailsPage';
import WishlistPage from '@/pages/WishlistPage';
import CartPage from '@/pages/CartPage';
import CheckoutPage from '@/pages/CheckoutPage';
import AccountPage from '@/pages/AccountPage';
import OrdersPage from '@/pages/OrdersPage';
import DownloadsPage from '@/pages/DownloadsPage';
import AboutPage from '@/pages/AboutPage';
import PoliciesPage from '@/pages/PoliciesPage';
import ContactPage from '@/pages/ContactPage';
import NotFoundPage from '@/pages/NotFoundPage';
import PaymentResultPage from '@/pages/PaymentResultPage';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<StoreLayout />}>
        <Route index element={<HomePage />} />
        <Route path="books" element={<BooksPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="book/:productId" element={<BookDetailsPage />} />
        <Route path="wishlist" element={<WishlistPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="payment/result" element={<PaymentResultPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="account/orders" element={<OrdersPage />} />
        <Route path="account/downloads" element={<DownloadsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="contact" element={<ContactPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
