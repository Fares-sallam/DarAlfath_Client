import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock3, Loader2, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import TurnstileWidget, { TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/TurnstileWidget';
import { useDeleteProductReview, useProductReviews, useSubmitProductReview, type ProductReview } from '@/hooks/useStorefront';

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

function ReviewItem({ review, mine = false }: { review: ProductReview; mine?: boolean }) {
  return (
    <>
      <div className="bk3-review__hd">
        <StarRow value={review.rating} />
        <span className="bk3-review__name">{mine ? 'تعليقك' : review.reviewer_name}</span>
        {review.is_verified_buyer && (
          <span className="bk3-review__verified">
            <BadgeCheck size={13} aria-hidden="true" /> مشتري موثّق
          </span>
        )}
        <span className="bk3-review__date">{formatReviewDate(review.created_at)}</span>
      </div>
      {review.comment && <p className="bk3-review__body">{review.comment}</p>}
    </>
  );
}

/**
 * A book's comments, in the book page's "التعليقات" tab: the approved ones, and a form anyone can use
 * (a name, a rating, the comment). What is sent waits for the store's approval in the dashboard before
 * it shows. A signed-in customer sees their own comment while it waits, and can edit or delete it.
 */
export default function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useProductReviews(productId);
  const submit = useSubmitProductReview();
  const remove = useDeleteProductReview();

  const mine = user ? reviews.find((r) => r.user_id === user.id) ?? null : null;
  const shown = reviews.filter((r) => r.status === 'approved' && r.id !== mine?.id);

  const accountName = ((user?.user_metadata?.full_name as string | undefined) ?? '').trim();
  const [name, setName] = useState(accountName);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState('');
  const [token, setToken] = useState('');
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const turnstile = useRef<TurnstileHandle>(null);

  useEffect(() => {
    if (accountName && !name) setName(accountName);
  }, [accountName, name]);

  const showForm = !sent && (mine ? editing : true);
  const nameOk = name.trim().length >= 2;
  const commentOk = comment.trim().length >= 3;
  const ready = nameOk && rating > 0 && commentOk && (!TURNSTILE_SITE_KEY || Boolean(token));

  const startEdit = () => {
    if (!mine) return;
    setName(mine.reviewer_name);
    setRating(mine.rating);
    setComment(mine.comment ?? '');
    setError('');
    setEditing(true);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      setError(!nameOk ? 'اكتب اسمك.' : rating === 0 ? 'اختر تقييمك بالنجوم.' : !commentOk ? 'اكتب تعليقك.' : 'انتظر حتى يكتمل التحقق الأمني.');
      return;
    }
    setError('');
    try {
      await submit.mutateAsync({ productId, reviewerName: name, rating, comment, turnstileToken: token, website });
      setSent(true);
      setEditing(false);
      setComment('');
      setRating(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال التعليق.');
    } finally {
      turnstile.current?.reset();
    }
  };

  const deleteMine = async () => {
    if (!mine || !confirm('حذف تعليقك على هذا الكتاب؟')) return;
    await remove.mutateAsync({ id: mine.id, productId });
    setEditing(false);
  };

  return (
    <div className="bk3-reviews">
      {/* The signed-in customer's own comment, approved or waiting. */}
      {mine && !editing && (
        <div className="bk3-review bk3-review--mine" data-testid="my-review">
          <ReviewItem review={mine} mine />
          <p className={`bk3-review__state bk3-review__state--${mine.status}`}>
            {mine.status === 'approved' ? (
              <><CheckCircle2 size={14} aria-hidden="true" /> ظاهر في صفحة الكتاب</>
            ) : mine.status === 'pending' ? (
              <><Clock3 size={14} aria-hidden="true" /> قيد المراجعة، ويظهر بعد موافقة الإدارة</>
            ) : (
              'غير ظاهر في صفحة الكتاب'
            )}
          </p>
          <div className="bk3-review__actions">
            <button type="button" onClick={startEdit}>تعديل</button>
            <button type="button" onClick={deleteMine} disabled={remove.isPending}>
              <Trash2 size={13} /> حذف
            </button>
          </div>
        </div>
      )}

      {sent && (
        <div className="bk3-reviews__sent" role="status" data-testid="review-sent">
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <b>شكرًا! وصلنا تعليقك.</b>
            <p>سيظهر في صفحة الكتاب بعد مراجعة الإدارة.</p>
          </div>
          {!mine && (
            <button type="button" className="bk3-review-form__cancel" onClick={() => setSent(false)}>
              اكتب تعليقًا آخر
            </button>
          )}
        </div>
      )}

      {showForm && (
        <form className="bk3-review-form" onSubmit={send} noValidate aria-label="اكتب تعليقك">
          <h3>{mine ? 'تعديل تعليقك' : 'اكتب تعليقك'}</h3>

          <label className="bk3-review-form__field">
            <span>الاسم</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="الاسم الذي سيظهر مع تعليقك" />
          </label>

          <div className="bk3-review-form__field">
            <span id={`rating-${productId}`}>التقييم</span>
            <div className="bk3-review-form__stars" role="radiogroup" aria-labelledby={`rating-${productId}`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={rating === i}
                  onClick={() => setRating(i)}
                  aria-label={`${i} من 5`}
                  className={i <= rating ? 'bk3-review-form__star--on' : ''}
                >
                  <Star size={22} fill={i <= rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <label className="bk3-review-form__field">
            <span>التعليق</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={4} placeholder="شاركنا رأيك في الكتاب" />
          </label>

          {/* Left empty by people (it's off screen); a script fills it in. */}
          <input
            className="bk3-review-form__trap"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          <TurnstileWidget ref={turnstile} onToken={setToken} />

          {error && <p className="bk3-review-form__error" role="alert">{error}</p>}

          <div className="bk3-review-form__actions">
            <button type="submit" className="bk3-review-form__submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 size={14} className="bk3-spin" /> : mine ? 'إرسال التعديل' : 'إرسال التعليق'}
            </button>
            {editing && (
              <button type="button" className="bk3-review-form__cancel" onClick={() => setEditing(false)}>
                إلغاء
              </button>
            )}
          </div>
          <p className="bk3-review-form__note">تظهر التعليقات بعد مراجعة الإدارة.</p>
        </form>
      )}

      {isLoading ? (
        <p className="bk3-reviews__loading">جارٍ تحميل التعليقات...</p>
      ) : shown.length === 0 ? (
        !mine && <p className="bk3-reviews__empty">لا توجد تعليقات بعد. كن أول من يكتب رأيه في هذا الكتاب.</p>
      ) : (
        <ul className="bk3-reviews__list" data-testid="reviews-list">
          {shown.map((r) => (
            <li key={r.id} className="bk3-review">
              <ReviewItem review={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
