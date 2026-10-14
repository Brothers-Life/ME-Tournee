import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

/** Saisie d'un code PIN (4 à 6 chiffres) ; onComplete déclenché à 6 chiffres. */
export function PinInput({
  value, onChange, onComplete, autoFocus, length = 6, id,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  length?: number;
  id?: string;
}) {
  return (
    <InputOTP
      id={id}
      maxLength={length}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      pattern={REGEXP_ONLY_DIGITS}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label="Code PIN"
    >
      <InputOTPGroup>
        {Array.from({ length }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-10 text-base [-webkit-text-security:disc]" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
