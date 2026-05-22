import { useRef, useCallback, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export default function OtpInput({ value, onChange, length = 6, disabled = false }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.padEnd(length, '').split('').slice(0, length);

  const focusInput = useCallback((index: number) => {
    const el = inputsRef.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const updateDigit = useCallback((index: number, digit: string) => {
    const next = [...digits];
    next[index] = digit;
    onChange(next.join('').replace(/\s/g, ''));
  }, [digits, onChange]);

  const handleChange = useCallback((index: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) return;

    const digit = raw[raw.length - 1];
    updateDigit(index, digit);

    if (index < length - 1) {
      focusInput(index + 1);
    }
  }, [updateDigit, length, focusInput]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        updateDigit(index, '');
      } else if (index > 0) {
        updateDigit(index - 1, '');
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      // RTL-aware: ArrowRight goes to previous (lower index), ArrowLeft goes to next
      const dir = e.key === 'ArrowRight' ? -1 : 1;
      const target = index + dir;
      if (target >= 0 && target < length) focusInput(target);
    }
  }, [digits, updateDigit, focusInput, length]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    focusInput(Math.min(pasted.length, length - 1));
  }, [onChange, length, focusInput]);

  return (
    <div className="otp-input" dir="ltr">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={2}
          value={digit}
          disabled={disabled}
          aria-label={`رقم ${i + 1} من ${length}`}
          className={`otp-input__cell${digit ? ' otp-input__cell--filled' : ''}`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
