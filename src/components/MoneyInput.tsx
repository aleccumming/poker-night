import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
};

/** A "$ [   ]" field that brings up the number pad on phones. */
export function MoneyInput({ value, onChange, className = '', ...rest }: Props) {
  return (
    <label className={'money ' + className}>
      <span aria-hidden="true">$</span>
      <input
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        onFocus={(e) => e.target.select()}
        {...rest}
      />
    </label>
  );
}
