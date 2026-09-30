'use client';
import { useRef } from 'react';

// Code secret = 4 chiffres (saisie type PIN, clavier numérique, avance automatique).
// Le 1er champ porte aria-label={label} : getByLabel('Code secret') reste unique (compat E2E existante).
export default function PinInput({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(i: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 2) { // remplissage direct (fill Playwright / collage multi-chiffres)
      const v = digits.slice(0, 4);
      onChange(v);
      refs.current[Math.min(v.length, 3)]?.focus();
      return;
    }
    if (digits.length === 2) { // frappé par-dessus un chiffre existant → on garde le nouveau
      onChange((value.slice(0, i) + digits[1] + value.slice(i + 1)).slice(0, 4));
      refs.current[Math.min(i + 1, 3)]?.focus();
      return;
    }
    if (digits.length === 1) {
      onChange((value.slice(0, i) + digits + value.slice(i + 1)).slice(0, 4));
      refs.current[Math.min(i + 1, 3)]?.focus();
      return;
    }
    onChange(value.slice(0, i) + value.slice(i + 1)); // effacement
  }

  return (
    <div className="pin">
      {[0, 1, 2, 3].map((i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
               inputMode="numeric" pattern="[0-9]*" maxLength={4}
               aria-label={i === 0 ? label : `Chiffre ${i + 1}`}
               autoComplete={i === 0 ? autoComplete : 'off'}
               value={value[i] ?? ''}
               onChange={(e) => setDigit(i, e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Backspace' && !value[i] && i > 0) {
                   e.preventDefault();
                   onChange(value.slice(0, i - 1) + value.slice(i));
                   refs.current[i - 1]?.focus();
                 }
               }} />
      ))}
    </div>
  );
}
