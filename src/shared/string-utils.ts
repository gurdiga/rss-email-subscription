type AllowedIterpolatedValueType = string | number;

/**
 * Strict interpolation: the interpolated expressions are reqiured to be strings or numbers.
 *
 * Kudos to https://github.com/wongjiahau
 * https://github.com/microsoft/TypeScript/issues/30239#issuecomment-1132372523
 */
export function si(strings: TemplateStringsArray, ...values: AllowedIterpolatedValueType[]): string {
  return strings.reduce(interpolate(values), '');
}

/**
 * Strict interpolation for raw strings: the interpolated expressions are reqiured to be strings or numbers.
 *
 * Kudos to Dr. Axel Rauschmayer
 * https://exploringjs.com/es6/ch_template-literals.html#_example-stringraw
 */
export function rawsi(strings: TemplateStringsArray, ...values: AllowedIterpolatedValueType[]) {
  return strings.raw.reduce(interpolate(values), '');
}

function interpolate(values: AllowedIterpolatedValueType[]) {
  return (result: string, string: string, index: number) => result + string + (values[index] ?? '');
}

export function formatMoney(cents: number): string {
  const options = { style: 'currency', currency: 'usd', maximumSignificantDigits: 2 };

  return new Intl.NumberFormat('en-US', options).format(cents / 100);
}

export function capitalize(s: string): string {
  const firstLetter = s.substring(0, 1);
  const rest = s.substring(1);

  return firstLetter.toUpperCase() + rest;
}
