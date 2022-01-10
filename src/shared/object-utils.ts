export function isObject(value: unknown): value is object {
  // As per https://nodejs.org/api/util.html#utilisobjectobject
  return value !== null && typeof value === 'object';
}
