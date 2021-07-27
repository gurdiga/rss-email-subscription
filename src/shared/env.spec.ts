import { expect } from 'chai';

describe(requireEnv.name, () => {
  it('returns typed key-value pairs for the given envars', () => {
    const envars = {
      HOME: '/home/vlad',
      UID: '42',
    };

    const result = requireEnv<{ HOME: string; UID: number }>({ HOME: '', UID: 0 }, envars);

    expect(result).to.deep.equal({
      HOME: envars.HOME,
      UID: parseInt(envars.UID),
    });
  });
});

function requireEnv<T = Record<string, string | number>>(
  initialValues: T,
  envars: NodeJS.Process['env'] = process.env
): T {
  const getEnvar = (name: string) => envars[name] || '';

  return mapObject(initialValues, (key, value) => [
    key,
    typeof value === 'string' ? getEnvar(key) : parseInt(getEnvar(key), 10),
  ]);
}

// TODO: Move to shared/lang and add unit tests
function mapObject<V = string | number, T = Record<string, V>>(
  object: T,
  mapFn: (key: string, value: V) => [string, V]
): T {
  const entries = Object.entries(object);
  const mappedEntries = entries.map(([key, value]) => mapFn(key, value));

  return Object.fromEntries(mappedEntries) as any as T;
}
