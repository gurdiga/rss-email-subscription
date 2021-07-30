import { makeErr, Result } from './lang';

export function requireEnv<ENV = Record<string, string>>(
  envarNames: (keyof ENV)[],
  envars: NodeJS.Process['env'] = process.env
): Result<ENV> {
  const values = {} as ENV;

  for (const envarName of envarNames) {
    const envarValue = envars[envarName as string];

    if (!envarValue) {
      return makeErr(`Environment variable ${envarName} is not set`);
    }

    values[envarName] = envarValue as any;
  }

  return values;
}
