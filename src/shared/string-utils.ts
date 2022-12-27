import { join } from 'node:path';

/**
 * Strict interpolation: the interpolated expressions are reqiured to be strings.
 *
 * Kudos to https://github.com/wongjiahau
 * https://github.com/microsoft/TypeScript/issues/30239#issuecomment-1132372523
 */
export function si(strings: TemplateStringsArray, ...values: string[]): string {
  return strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '');
}

export function path(...segments: string[]): string {
  return join(...segments);
}
