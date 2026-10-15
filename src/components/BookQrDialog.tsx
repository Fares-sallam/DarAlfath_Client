import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { qrDataUri } from '@/lib/qr';

type Props = {
  /** The page the code opens. */
  url: string;
  title: string;
  onClose: () => void;
};

/**
 * A book's QR code, large, for someone to point a phone at. The card stays white in the dark theme
 * too: a scanner needs dark modules on a light ground with some margin around them.
 */
export default function BookQrDialog({ url, title, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose without making the effect below start over each time the parent renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    qrDataUri(url)
      .then((uri) => { if (alive) setSrc(uri); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      // The close button is the only thing to reach: keep Tab from walking into the page behind.
      else if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="bk3-qr"
      role="dialog"
      aria-modal="true"
      aria-label={`رمز QR لكتاب ${title}`}
      onClick={onClose}
      data-testid="book-qr-dialog"
    >
      <button
        ref={closeRef}
        type="button"
        className="bk3-lightbox__close"
        onClick={onClose}
        aria-label="إغلاق"
      >
        <X size={22} />
      </button>

      <div className="bk3-qr__card" onClick={(e) => e.stopPropagation()}>
        <div className="bk3-qr__code" aria-busy={!src && !failed}>
          {src && <img src={src} alt={`رمز QR يفتح صفحة ${title}`} data-testid="book-qr-image" />}
          {failed && <p className="bk3-qr__error">تعذّر إنشاء الرمز. أغلق النافذة وحاول مرة أخرى.</p>}
        </div>
        <h2 className="bk3-qr__title">{title}</h2>
        <p className="bk3-qr__hint">وجّه كاميرا هاتفك نحو الرمز لفتح صفحة الكتاب</p>
      </div>
    </div>
  );
}
