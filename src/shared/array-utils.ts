export type ArraySortFn<T> = (a: T, b: T) => number;

export function filterUniq<T>(x: T, i: number, xx: T[]): boolean {
  return xx.indexOf(x) === i;
}
