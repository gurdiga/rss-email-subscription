export function filterUniq<T>(x: T, i: number, xx: T[]): boolean {
  return xx.indexOf(x) === i;
}

export function filterUniqBy<T>(mapFn: (value: T) => any) {
  const keys: unknown[] = [];

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

export enum SortDirection {
  Asc,
  Desc,
}

export function sortBy<T>(mapFn: (value: T) => ComparableType, direction: SortDirection = SortDirection.Asc) {
  const result = direction === SortDirection.Asc ? 1 : -1;

  return (a: T, b: T) => {
    return mapFn(a) > mapFn(b) ? +result : -result;
  };
}

export function isEmpty(array: unknown[]): boolean {
  return array.length === 0;
}

export function isNotEmpty(array: unknown[]): boolean {
  return array.length > 0;
}
