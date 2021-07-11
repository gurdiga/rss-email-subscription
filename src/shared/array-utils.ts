export type ArraySortFn<T> = (a: T, b: T) => number;

export function filterUniq<T>(x: T, i: number, xx: T[]): boolean {
  return xx.indexOf(x) === i;
}

export function filterUniqBy<T>(mapFn: (value: T) => any) {
  const keys: any[] = [];

  return (x: T): boolean => {
    try {
      const key = mapFn(x);

      if (keys.includes(key)) {
        return false;
      } else {
        keys.push(key);
        return true;
      }
    } catch (error) {
      return false;
    }
  };
}

type ComparableType = number | string | Date | boolean;
type SortDirection = 'asc' | 'desc';

export function sortBy<T>(mapFn: (value: T) => ComparableType, direction: SortDirection = 'asc') {
  const result = direction === 'asc' ? 1 : -1;
  return (a: T, b: T) => {
    return mapFn(a) > mapFn(b) ? result : -result;
  };
}

export function isEmpty(array: any[]): boolean {
  return array.length === 0;
}
