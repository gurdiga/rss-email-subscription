import { ApiResponse, AppError, InputError, isAppError, isInputError } from '../shared/api-response';
import { makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement, insertAdjacentElement, querySelector } from './dom-isolation';

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
      logErrorFn(si`Missing parameter: ${paramName}`);
      return makeErr('Invalid confirmation link');
    }
  }

  return params;
}

export function requireUiElements<T>(selectors: Record<keyof T, string>, querySelectorFn = querySelector): Result<T> {
  const uiElements = {} as T;

  for (const name in selectors) {
    const selector = selectors[name];
    const element = querySelectorFn(selector);

    if (!element) {
      return makeErr(si`Element not found by selector: "${selector}"`);
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
      return makeErr(si`UiElementFillSpec element is missing in ${JSON.stringify(spec)}`);
    }

    if (!(spec.propName in spec.element)) {
      return makeErr(si`Prop "${String(spec.propName)}" does not exist on ${spec.element.tagName}`);
    }

    spec.element[spec.propName] = spec.value;
  }
}

export function displayMainError(message: string) {
  const errorMessageSelector = '#init-error-message';
  const errorMessageElement = document.querySelector(errorMessageSelector);

  if (!errorMessageElement) {
    reportError(si`Element is missing: ${errorMessageSelector}`);
    return;
  }

  errorMessageElement.textContent = message;
  errorMessageElement.className = 'alert alert-danger';

  reportError(message);
}

export type AppStatusUiElements = ApiResponseUiElements & AppErrorUiElements;

export interface ApiResponseUiElements {
  apiResponseMessage: HTMLElement;
}

export interface AppErrorUiElements {
  appErrorMessage: HTMLElement;
}

export function displayApiResponse(apiResponse: ApiResponse, messageElement: Element): void {
  const className = isInputError(apiResponse) || isAppError(apiResponse) ? 'alert alert-danger' : 'alert alert-success';

  messageElement.textContent = apiResponse.message;
  messageElement.className = className;
  messageElement.setAttribute('role', 'alert');
}

export function displayCommunicationError(error: unknown, messageElement: Element): void {
  reportError(error as Error);

  messageElement.textContent = 'Failed to connect to the server. Please try again in a few moments.';
  messageElement.className = 'alert alert-danger';
  messageElement.setAttribute('role', 'alert');
}

export function displayAppError(error: AppError, messageElement: Element): void {
  messageElement.textContent = error.message;
  messageElement.className = 'alert alert-danger';
  messageElement.setAttribute('role', 'alert');
}

export function reportError(error: Error | string): void {
  if (typeof error === 'string') {
    error = new Error(error);
  }

  // This will be handled by the global error handler defined here:
  // https://github.com/gurdiga/feedsubscription.com/commit/06e3447
  // It is thrown as a Promise rejection so that it doesn’t break the
  // execution flow.
  Promise.reject(error);
}

export function assertHeader(headerName: string, expectedHeaderValue: string) {
  return (response: Response) => {
    const contentType = response.headers.get(headerName)!;

    if (contentType === expectedHeaderValue) {
      return response;
    } else {
      throw new TypeError(si`Unexpected response type: ${contentType}`);
    }
  };
}

export function assertFound(response: Response) {
  if (response.status === 404) {
    throw new TypeError('Invalid API endpoint');
  } else {
    return response;
  }
}

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
}

export function sendApiRequest(
  relativePath: string,
  method: HttpMethod = HttpMethod.GET,
  data: Record<string, string> = {}
): Promise<ApiResponse> {
  const basePath = '/api';
  const url = si`${basePath}${relativePath}`;
  const body = new URLSearchParams(data);

  return fetch(url, { method, body })
    .then(assertFound)
    .then(assertHeader('content-type', 'application/json; charset=utf-8'))
    .then(async (r) => (await r.json()) as ApiResponse);
}

export function preventDoubleClick(button: HTMLButtonElement, f: () => Promise<void>): void {
  const initialTextContent = button.textContent;

  button.disabled = true;
  button.textContent = 'Wait…';

  f().then(() => {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = initialTextContent;
    }, 500);
  });
}

export function displayValidationError<FF>(
  response: InputError,
  formFields: FF,
  getOrCreateValidationMessageFn = getOrCreateValidationMessage
) {
  const field = response.field as keyof FF;

  if (!field) {
    reportError('No "field" prop in InputError from API.');
    return;
  }

  const fieldElement = formFields[field] as HTMLElement;

  fieldElement.className += ' is-invalid';
  fieldElement.focus();

  const validationMessage = getOrCreateValidationMessageFn(fieldElement);

  validationMessage.textContent = response.message;
}

export function getOrCreateValidationMessage(
  fieldElement: HTMLElement,
  createElementFn = createElement,
  insertAdjacentElementFn = insertAdjacentElement
): HTMLElement {
  const existingElement = fieldElement.nextElementSibling as HTMLElement;

  if (existingElement && existingElement.className.includes('validation-message')) {
    return existingElement;
  } else {
    const newElement = createElementFn('div');

    newElement.className = 'validation-message invalid-feedback';
    insertAdjacentElementFn(fieldElement, 'afterend', newElement);

    return newElement;
  }
}

export function clearValidationErrors<FF>(formFields: FF): void {
  for (const field in formFields) {
    const fieldElement = formFields[field as keyof FF] as HTMLElement;
    const isInvalid = getClassNames(fieldElement).includes('is-invalid');

    if (!isInvalid) {
      continue;
    }

    fieldElement.className = getClassNames(fieldElement)
      .filter((x) => x !== 'is-invalid')
      .join(' ');

    const errorMessageElement = fieldElement.nextElementSibling;

    if (!errorMessageElement) {
      continue;
    }

    const classNames = getClassNames(errorMessageElement);

    if (classNames.includes('validation-message') && classNames.includes('invalid-feedback')) {
      errorMessageElement.remove();
    }
  }
}

export function getClassNames(element: Element): string[] {
  return element.className.split(/\s+/).filter((x) => !!x);
}

export function hideElement(element: HTMLElement): void {
  element.setAttribute('hidden', 'hidden');
}

export function unhideElement(element: HTMLElement): void {
  element.removeAttribute('hidden');
}

export function navigateTo(url: string, delay = 0): void {
  setTimeout(() => {
    location.href = url;
  }, delay);
}
