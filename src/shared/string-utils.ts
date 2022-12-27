/**
 * Strict interpolation: the interpolated expressions are reqiured to be strings or numbers.
 *
 * Kudos to https://github.com/wongjiahau
 * https://github.com/microsoft/TypeScript/issues/30239#issuecomment-1132372523
 */
export function si(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '');
}
