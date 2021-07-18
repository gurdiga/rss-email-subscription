type EnvVarName = 'FROM_EMAIL_ADDRESS' | 'SMTP_CONNECTION_STRING';

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
