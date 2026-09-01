import { useState } from 'react';
import { Star, Loader2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useProductReviews,
  useCanReviewProduct,
  useSubmitProductReview,
  useDeleteProductReview,
} from '@/hooks/useStorefront';

function formatReviewDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function StarRow({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <div className="bk3-review-stars" aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} />
      ))}
    </div>
  );
}

/**
 * Real customer reviews for a product — verified-purchase gated (a
 * customer can only write one once an order containing this product has
 * status تم التوصيل, enforced server-side; see product_reviews' RLS).
 * Lives inside BookDetailsPage's tab body.
 */
export default function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useProductReviews(productId);
  const { data: canReview, isLoading: canReviewLoading } = useCanReviewProduct(productId);
  const submitReview = useSubmitProductReview();
  const deleteReview = useDeleteProductReview();

  const myReview = user ? (reviews.find((r) => r.user_id === user.id) ?? null) : null;
  const otherReviews = reviews.filter((r) => r.id !== myReview?.id);

  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const startEdit = () => {
    setRating(myReview?.rating ?? 5);
    setComment(myReview?.comment ?? '');
    setEditing(true);
  };

  const handleSubmit = async () => {
    if (!user) return;
    const name =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split('@')[0] ||
      'قارئ';
    await submitReview.mutateAsync({
      productId,
      userId: user.id,
      reviewerName: name,
      rating,
      comment: comment.trim() || null,
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!myReview) return;
    if (!confirm('حذف تقييمك لهذا الكتاب؟')) return;
    await deleteReview.mutateAsync({ id: myReview.id, productId });
    setEditing(false);
  };

  const showForm = editing || (!myReview && canReview);

  return (
    <div className="bk3-reviews">
      {/* ── My review card / write-a-review form / gate messages ── */}
      {!user ? (
        <div className="bk3-reviews__gate">
          <p>سجّل الدخول لتقييم هذا الكتاب.</p>
          <Link to="/account" className="bk3-reviews__gate-link">تسجيل الدخول</Link>
        </div>
      ) : showForm ? (
        <div className="bk3-review-form">
          <h3>{myReview ? 'تعديل تقييمك' : 'اكتب تقييمك'}</h3>
          <div className="bk3-review-form__stars">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                aria-label={`${i} نجوم`}
                className={i <= rating ? 'bk3-review-form__star--on' : ''}
              >
                <Star size={22} fill={i <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="شاركنا رأيك في الكتاب (اختياري)"
            rows={3}
          />
          <div className="bk3-review-form__actions">
            <button
              type="button"
              className="bk3-review-form__submit"
              onClick={handleSubmit}
              disabled={submitReview.isPending}
            >
              {submitReview.isPending ? (
                <Loader2 size={14} className="bk3-spin" />
              ) : myReview ? (
                'حفظ التعديل'
              ) : (
                'نشر التقييم'
              )}
            </button>
            {editing && (
              <button type="button" className="bk3-review-form__cancel" onClick={() => setEditing(false)}>
                إلغاء
              </button>
            )}
          </div>
        </div>
      ) : myReview ? (
        <div className="bk3-review bk3-review--mine">
          <div className="bk3-review__hd">
            <StarRow value={myReview.rating} />
            <span className="bk3-review__name">تقييمك</span>
            <span className="bk3-review__date">{formatReviewDate(myReview.updated_at)}</span>
          </div>
          {myReview.comment && <p className="bk3-review__body">{myReview.comment}</p>}
          <div className="bk3-review__actions">
            <button type="button" onClick={startEdit}>تعديل</button>
            <button type="button" onClick={handleDelete} disabled={deleteReview.isPending}>
              <Trash2 size={13} /> حذف
            </button>
          </div>
        </div>
      ) : !canReviewLoading ? (
        <p className="bk3-reviews__locked">التقييم متاح فقط لمن اشترى هذا الكتاب واستلمه.</p>
      ) : null}

      {/* ── Other customers' reviews ── */}
      {isLoading ? (
        <p className="bk3-reviews__loading">جارٍ تحميل التقييمات...</p>
      ) : otherReviews.length === 0 ? (
        !myReview && <p className="bk3-reviews__empty">لا توجد تقييمات بعد — كن أول من يقيّم هذا الكتاب.</p>
      ) : (
        <ul className="bk3-reviews__list">
          {otherReviews.map((r) => (
            <li key={r.id} className="bk3-review">
              <div className="bk3-review__hd">
                <StarRow value={r.rating} />
                <span className="bk3-review__name">{r.reviewer_name}</span>
                <span className="bk3-review__date">{formatReviewDate(r.created_at)}</span>
              </div>
              {r.comment && <p className="bk3-review__body">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
