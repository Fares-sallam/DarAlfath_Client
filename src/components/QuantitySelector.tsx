import { useTheme } from '@/contexts/ThemeContext';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  /** The most there is (the copies in stock): "+" stops there. */
  max?: number | null;
  /** The book card's smaller stepper. */
  compact?: boolean;
}

export default function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = null,
  compact = false,
}: QuantitySelectorProps) {
  const { isDark } = useTheme();
  const atMax = max != null && value >= max;
  const decrease = () => onChange(Math.max(min, value - 1));
  const increase = () => {
    if (!atMax) onChange(value + 1);
  };

  return (
    <div
      className={`qty-stepper qty-stepper--soft${compact ? ' qty-stepper--card' : ''}`}
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

      <span aria-live="polite" aria-label={`الكمية ${value}`} style={isDark ? { color: '#F0EDFF' } : undefined}>
        {value}
      </span>

      <button
        type="button"
        onClick={increase}
        disabled={atMax}
        aria-label="زيادة الكمية"
        title={atMax ? 'دي كل الكمية المتاحة' : undefined}
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
