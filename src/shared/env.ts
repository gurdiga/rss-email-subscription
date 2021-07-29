import { makeErr, Result } from './lang';

export type EnvVarName = 'APP_BASE_URL' | 'SMTP_CONNECTION_STRING';
export type RequireEnvVarFn = (varName: EnvVarName) => string;

export function requireEnvVar(varName: EnvVarName): string {
  assert(varName in process.env, `Env var is missing: ${varName}`);

  return process.env[varName]!;
}

export function requireNumericEnvVar(varName: EnvVarName): number {
  const n = parseInt(requireEnvVar(varName), 10);

  assert(!isNaN(n), `Expected env var ${varName} to be a number, not ${n}`);

  return n;
}

function assert(precondition: boolean, message: string): void {
  if (!precondition) {
    throw new EnvironmentAssertionError(message);
  }
}

export class EnvironmentAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentAssertionError';
  }
}

export function requireEnv<ENV = Record<string, string>>(
  envarNames: (keyof ENV)[],
  envars: NodeJS.Process['env'] = process.env
): Result<ENV> {
  const values = {} as ENV;

  for (const envarName of envarNames) {
    const envarValue = envars[envarName] as string;

    if (!envarValue) {
      return makeErr(`Environment variable ${envarName} is not set`);
    }

    values[envarName] = envarValue as any;
  }

  return values;
}
