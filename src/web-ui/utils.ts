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
