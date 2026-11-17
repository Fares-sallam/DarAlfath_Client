import { useEffect } from 'react';
import { useAppearance } from '@/hooks/useAppearance';
import { BUTTON_KEYS, PREVIEW_PARAM, buttonCssVars, buttonPaint, patternFactor } from '@/lib/appearance';

/**
 * Puts the dashboard's choices on the page: the pattern strength and the colours of the four buttons, as custom
 * properties on <html> that styles-appearance.css reads. A button that was given no colour sets nothing, so it
 * keeps the colours it was designed with. Draws nothing, except a thin strip while a draft is being previewed.
 */
export default function AppearanceStyle() {
  const { appearance, isPreview } = useAppearance();

  useEffect(() => {
    const root = document.documentElement;
    const vars = buttonCssVars(appearance.button_styles);
    const painted = BUTTON_KEYS.filter((key) => buttonPaint(appearance.button_styles[key]) !== null);

    root.style.setProperty('--store-pattern-k', String(patternFactor(appearance.pattern_strength)));
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
    root.setAttribute('data-ab', painted.join(' '));

    return () => {
      root.style.removeProperty('--store-pattern-k');
      Object.keys(vars).forEach((name) => root.style.removeProperty(name));
      root.removeAttribute('data-ab');
    };
  }, [appearance]);

  if (!isPreview) return null;
  const leave = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(PREVIEW_PARAM, 'off');
    window.location.assign(url.toString());
  };
  return (
    <div className="look-preview-bar" role="status">
      <span>معاينة تعديلات المظهر قبل الحفظ، ولن يراها العملاء</span>
      <button type="button" onClick={leave}>إغلاق المعاينة</button>
    </div>
  );
}
