import { navbarCookieName } from '../api/app-cookie';
import { UiFeed } from '../domain/feed';
import { PagePath } from '../domain/page-path';
import {
  ApiResponse,
  AppError,
  AuthenticatedApiResponse,
  InputError,
  isAppError,
  isInputError,
} from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
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

export function requireQueryParams<RequiredParams>(
  paramDictionary: Record<keyof RequiredParams, string>,
  locationSearch = window.location.search
) {
  const params = {} as RequiredParams;
  const urlSearchParams = new URLSearchParams(locationSearch);

  for (const name in paramDictionary) {
    const paramName = paramDictionary[name];
    const element = urlSearchParams.get(paramName);

    if (!element) {
      return makeErr(si`Query param not found by name: "${paramName}"`);
    }

    params[name] = element as any;
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

export interface UiElementFillSpec<T extends HTMLElement = HTMLElement> {
  element: T;
  propName: 'textContent' | 'className';
  value: string;
}

export function fillUiElements(specs: UiElementFillSpec<HTMLElement>[]): Result<void> {
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

export function displayInitError(message: string) {
  const errorMessageSelector = '#init-error-message';
  const errorMessageElement = document.querySelector(errorMessageSelector);

  if (!errorMessageElement) {
    reportError(si`Element is missing: ${errorMessageSelector}`);
    return;
  }

  errorMessageElement.textContent = message;
  errorMessageElement.className = 'alert alert-danger';
  unhideElement(errorMessageElement);

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
  const isDanger = isInputError(apiResponse) || isAppError(apiResponse);

  messageElement.textContent = apiResponse.message;
  messageElement.classList.add('alert');
  messageElement.classList.toggle('alert-danger', isDanger);
  messageElement.classList.toggle('alert-success', !isDanger);
  messageElement.setAttribute('role', 'alert');
}

export function displayCommunicationError(error: unknown, messageElement: Element): void {
  reportError(error as Error);

  messageElement.textContent = 'Failed to connect to the server. Please try again in a few moments.';
  messageElement.classList.add('alert', 'alert-danger');
  messageElement.setAttribute('role', 'alert');
  unhideElement(messageElement);
}

export function displayAppError(error: AppError, messageElement: Element): void {
  messageElement.textContent = error.message;
  messageElement.classList.add('alert', 'alert-danger');
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

function assertHeader(headerName: string, expectedHeaderValue: string) {
  return (response: Response) => {
    const contentType = response.headers.get(headerName)!;

    if (contentType === expectedHeaderValue) {
      return response;
    } else {
      throw new TypeError(si`Unexpected response type: ${contentType}`);
    }
  };
}

function assertAuthorized(response: Response) {
  if (response.status === 401) {
    setTimeout(() => {
      window.location.href = PagePath.userAuthentication;
    }, 2000);

    throw new Error('Session expired');
  } else {
    return response;
  }
}

export function assertFound(response: Response) {
  if (response.status === 404) {
    throw new TypeError('API endpoint not found (404)');
  } else {
    return response;
  }
}

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
}

export function sendApiRequest<R extends any = any>(
  relativePath: string,
  method: HttpMethod = HttpMethod.GET,
  data: Record<string, string> = {}
): Promise<AuthenticatedApiResponse<R>> {
  const basePath = '/api';
  const urlEncodedData = new URLSearchParams(data);

  const [url, body] =
    method === HttpMethod.POST
      ? [si`${basePath}${relativePath}`, urlEncodedData]
      : [si`${basePath}${relativePath}?${urlEncodedData.toString()}`, null];

  return fetch(url, { method, body })
    .then(assertFound)
    .then(assertHeader('content-type', 'application/json; charset=utf-8'))
    .then(assertAuthorized)
    .then(async (r) => (await r.json()) as AuthenticatedApiResponse<R>);
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

// TODO: How to test? Should I? Can I separate the data manipulation from DOM mechanics?
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

  if (!fieldElement) {
    reportError(si`Form field not found by "field" prop in InputError from API: ${String(field)}`);
    return;
  }

  fieldElement.className += ' is-invalid';
  fieldElement.focus();

  const validationMessage = getOrCreateValidationMessageFn(fieldElement);

  validationMessage.textContent = response.message;
}

export function getOrCreateValidationMessage(
  fieldElement: HTMLElement,
  createElementFn = createElement,
  insertAdjacentElementFn = insertAdjacentElement
): Element {
  const isInputGroup = fieldElement.nextElementSibling?.classList.contains('input-group-text');
  const existingElement = isInputGroup
    ? fieldElement.nextElementSibling?.nextElementSibling
    : fieldElement.nextElementSibling;

  if (existingElement && existingElement.className.includes('validation-message')) {
    return existingElement;
  } else {
    const referenceElement = isInputGroup ? fieldElement.nextElementSibling! : fieldElement;
    const newElement = createElementFn('div');

    newElement.className = 'validation-message invalid-feedback';
    insertAdjacentElementFn(referenceElement, 'afterend', newElement);

    return newElement;
  }
}

export function clearValidationErrors<FF>(formFields: FF): void {
  for (const field in formFields) {
    const fieldElement = formFields[field as keyof FF] as HTMLElement;
    const isInvalid = fieldElement.classList.contains('is-invalid');

    if (!isInvalid) {
      continue;
    }

    fieldElement.classList.remove('is-invalid');

    const isInputGroup = fieldElement.nextElementSibling?.classList.contains('input-group-text');
    const errorMessageElement = isInputGroup
      ? fieldElement.nextElementSibling?.nextElementSibling
      : fieldElement.nextElementSibling;

    if (!errorMessageElement) {
      continue;
    }

    const classNames = errorMessageElement.classList;

    if (classNames.contains('validation-message') && classNames.contains('invalid-feedback')) {
      errorMessageElement.remove();
    }
  }
}

export function hideElement(element: HTMLElement): void {
  element.setAttribute('hidden', 'hidden');
}

export function unhideElement(element: Element): void {
  element.removeAttribute('hidden');
}

export function navigateTo(url: string, delay = 0): void {
  setTimeout(() => {
    location.href = url;
  }, delay);
}

export async function loadUiFeed<T = UiFeed>(id: string): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(si`/feeds/${id}`, HttpMethod.GET));

  if (isErr(response)) {
    return makeErr('Failed to load the feed');
  }

  if (isAppError(response)) {
    return makeErr(si`Application error when loading the feed: ${response.message}`);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed');
  }

  return response.responseData!;
}

export interface UiFeedFormFields {
  displayName: HTMLInputElement;
  url: HTMLInputElement;
  id: HTMLInputElement;
  replyTo: HTMLInputElement;
}

export const uiFeedFormFields: Record<keyof UiFeedFormFields, string> = {
  displayName: '#feed-name-field',
  url: '#feed-url-field',
  id: '#feed-id-field',
  replyTo: '#feed-reply-to-field',
};

export function getCookieByName(name: string, documentCookie = document.cookie): string {
  const pairs = documentCookie.split('; ');
  const pair = pairs.find((x) => x.startsWith(si`${name}=`)) || '';

  const encodedValue = pair.split('=')[1] || '';
  const value = decodeURIComponent(encodedValue);

  return value;
}

export function isAuthenticated(): boolean {
  return getCookieByName(navbarCookieName) === 'true';
}
