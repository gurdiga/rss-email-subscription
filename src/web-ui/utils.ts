import { ApiResponse, isAppError, isInputError } from '../shared/api-response';
import { makeErr, Result } from '../shared/lang';

export interface ConfirmationLinkUrlParams {
  id: string;
  displayName: string;
  email: string;
}

export function parseConfirmationLinkUrlParams(
  locationSearch: string,
  logErrorFn: typeof reportError = reportError
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
      logErrorFn(`Missing parameter: ${paramName}`);
      return makeErr(`Invalid confirmation link`);
    }
  }

  return params;
}

export type QuerySelectorFn = typeof document.querySelector;

export function requireUiElements<T>(
  selectors: Record<keyof T, string>,
  querySelector: QuerySelectorFn = (s: string) => document.querySelector(s)
): Result<T> {
  const uiElements = {} as T;

  for (const name in selectors) {
    const selector = selectors[name];
    const element = querySelector(selector);

    if (!element) {
      return makeErr(`Element not found by selector: "${selector}"`);
    }

    uiElements[name] = element as any;
  }

  return uiElements;
}

export interface UiElementFillSpec<T extends HTMLElement = any> {
  element: T;
  propName: keyof T;
  value: string;
}

export function fillUiElements(specs: UiElementFillSpec[]): Result<void> {
  for (const spec of specs) {
    if (!spec.element) {
      return makeErr(`UiElementFillSpec element is missing in ${JSON.stringify(spec)}`);
    }

    if (!(spec.propName in spec.element)) {
      return makeErr(`Prop "${String(spec.propName)}" does not exist on ${spec.element.tagName}`);
    }

    spec.element[spec.propName] = spec.value;
  }
}

export function displayMainError(message: string) {
  const errorMessageSelector = '#init-error-message';
  const errorMessageElement = document.querySelector(errorMessageSelector);

  if (!errorMessageElement) {
    reportError(`Element is missing: ${errorMessageSelector}`);
    return;
  }

  errorMessageElement.textContent = message;
  errorMessageElement.className = 'alert alert-danger';
}

export interface ResponseStatusUiElements {
  apiResponseMessage: Element;
}

export function handleApiResponse(apiResponse: ApiResponse, messageElement: Element): void {
  const className = isInputError(apiResponse) || isAppError(apiResponse) ? 'alert alert-danger' : 'alert alert-success';

  messageElement.textContent = apiResponse.message;
  messageElement.setAttribute('role', 'alert');
  messageElement.className = className;
}

export function handleCommunicationError(error: TypeError, messageElement: Element): void {
  reportError(error);

  messageElement.textContent = 'Can’t connect to the server. Please try again in a few moments.';
  messageElement.setAttribute('role', 'alert');
  messageElement.className = 'alert alert-danger';
}

export function reportError(error: Error | string): void {
  if (typeof error === 'string') {
    error = new Error(error);
  }

  // TODO: Record somewhere remotely? nginx? Rollbar?
  console.error('Unhandled error', error);
}

export function assertHeader(headerName: string, expectedHeaderValue: string) {
  return (response: Response) => {
    const contentType = response.headers.get(headerName);

    if (contentType === expectedHeaderValue) {
      return response;
    } else {
      throw new TypeError(`Unexpected response type: ${contentType}`);
    }
  };
}

export function assertFound(response: Response) {
  if (response.status === 404) {
    throw new TypeError(`Invalid API endpoint`);
  } else {
    return response;
  }
}

export function sendApiRequest(url: string, data: Record<string, string>): Promise<ApiResponse> {
  return fetch(url, {
    method: 'POST',
    body: new URLSearchParams(data),
  })
    .then(assertFound)
    .then(assertHeader('content-type', 'application/json; charset=utf-8'))
    .then(async (r) => (await r.json()) as ApiResponse);
}
