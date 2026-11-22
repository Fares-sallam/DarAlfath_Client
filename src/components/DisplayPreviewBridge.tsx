import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDisplayPreview, startDisplayPreviewBridge } from '@/lib/displayPreview';

/** Decided once, when the page is opened: the dashboard's frame opens the store with ?preview=display. */
const ENABLED = isDisplayPreview();

/** Only on the dashboard's preview page: takes the draft «تفاصيل العرض» the dashboard sends (see lib/displayPreview.ts). Draws nothing. */
export default function DisplayPreviewBridge() {
  const navigate = useNavigate();
  useEffect(() => (ENABLED ? startDisplayPreviewBridge((path) => navigate(path)) : undefined), [navigate]);
  return null;
}
