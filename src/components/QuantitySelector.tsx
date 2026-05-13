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
  const decrease = () => onChange(Math.max(min, value - 1));
  const increase = () => onChange(value + 1);

  return (
    <div className="qty-stepper qty-stepper--soft">
      <button type="button" onClick={decrease} aria-label="تقليل الكمية">
        −
      </button>

      <span>{value}</span>

      <button type="button" onClick={increase} aria-label="زيادة الكمية">
        +
      </button>
    </div>
  );
}