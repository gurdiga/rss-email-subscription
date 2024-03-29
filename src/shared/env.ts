import { makeErr, Result } from './lang';
import { si } from './string-utils';

export function requireEnv<ENV = Record<string, string>>(
  envarNames: (keyof ENV)[],
  envars: NodeJS.Process['env'] = process.env
): Result<ENV> {
  const values = {} as ENV;

  for (const envarName of envarNames) {
    const envarValue = envars[envarName as string];

    if (!envarValue) {
      return makeErr(si`Environment variable ${String(envarName)} is not set`);
    }

    values[envarName] = envarValue as any;
  }

  return values;
}
