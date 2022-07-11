import { makeErr, Result } from '../shared/lang';

export interface ConfirmationLinkUrlParams {
  id: string;
  displayName: string;
  email: string;
}

export type LogFn = (...args: any) => void;

export function parseConfirmationLinkUrlParams(
  locationSearch: string,
  logFn: LogFn = consoleLogFn
): Result<ConfirmationLinkUrlParams> {
  const queryParams = new URLSearchParams(locationSearch);
  const params: ConfirmationLinkUrlParams = {
    id: queryParams.get('id')!,
    displayName: queryParams.get('displayName')!,
    email: queryParams.get('email')!,
  };

  let paramName: keyof typeof params;

  for (paramName in params) {
    if (!params[paramName]) {
      logFn(`Missing parameter: ${paramName}`);
      return makeErr(`Invalid confirmation link`);
    }
  }

  return params;
}

function consoleLogFn(...args: any[]): void {
  console.error(...args);
}
