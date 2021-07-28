import { makeErr, Result } from './lang';

export type EnvVarName = 'APP_BASE_URL' | 'FROM_EMAIL_ADDRESS' | 'SMTP_CONNECTION_STRING';
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

export function requireEnv(
  envarTypes: Record<string, 'string' | 'number'>,
  envars: NodeJS.Process['env'] = process.env
): Result<Record<string, string | number>> {
  const values = { ...envarTypes };

  for (const envarName in envarTypes) {
    const envarValue = envars[envarName];

    if (!envarValue) {
      return makeErr(`Environment variable ${envarName} is missing`);
    }

    const expectedType = envarTypes[envarName];

    if (expectedType === 'number') {
      const persedNumber = parseFloat(envarValue);

      if (isNaN(persedNumber)) {
        return makeErr(`Environment variable ${envarName} is expected to contain a number`);
      }

      values[envarName] = persedNumber as any; // Don’t know how to to fit types.
    } else {
      values[envarName] = envarValue as any; // Don’t know how to to fit types.
    }
  }

  return values;
}
