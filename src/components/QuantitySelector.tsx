import { useTheme } from '@/contexts/ThemeContext';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}

export default function QuantitySelector({
  value,
  onChange,
  min = 1,
}: QuantitySelectorProps) {
  const { isDark } = useTheme();
  const decrease = () => onChange(Math.max(min, value - 1));
  const increase = () => onChange(value + 1);

  return (
    <div
      className="qty-stepper qty-stepper--soft"
      style={isDark ? {
        background: '#131F55',
        border: '1px solid #1E2D6B',
        boxShadow: 'none',
      } : undefined}
    >
      <button
        type="button"
        onClick={decrease}
        aria-label="تقليل الكمية"
        style={isDark ? {
          background: 'rgba(255,255,255,0.06)',
          color: '#C8D0F0',
          border: '1px solid rgba(255,255,255,0.08)',
        } : undefined}
      >
        −
      </button>

      <span style={isDark ? { color: '#F0EDFF' } : undefined}>
        {value}
      </span>

      <button
        type="button"
        onClick={increase}
        aria-label="زيادة الكمية"
        style={isDark ? {
          background: 'rgba(255,255,255,0.06)',
          color: '#C8D0F0',
          border: '1px solid rgba(255,255,255,0.08)',
        } : undefined}
      >
        +
      </button>
    </div>
  );
}
