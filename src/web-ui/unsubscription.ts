import { isErr, makeErr, Result } from '../shared/lang';
import { parseConfirmationLinkUrlParams } from './utils';

interface UnsubscriptionUiElements {
  errorMessage: Element;
}

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);
  const uiElements = requireUiElements<UnsubscriptionUiElements>({
    errorMessage: '#error-message',
  });

  if (isErr(uiElements)) {
    console.error('Some uiElement are missing?!');
    return;
  }

  console.log({ queryParams, uiElements });

  if (isErr(queryParams)) {
    displayError(queryParams.reason, uiElements.errorMessage);
    return;
  }

  /**

  Steps:

  - 1. input processing
    - Unhappy paths
      - invalid query params
        - Display error message
    - Happy path
      - query params are in place and valid
        - Fill in the form
  - 2. send request to API
    - Happy path
      - display the success message
    - Unhappy paths
      - app error
      - server error

   */

  // TODO?
}

main();

function displayError(message: string, el: Element) {
  el.textContent = message;
}

function requireUiElements<T>(selectors: Record<keyof T, string>, parentElement: Element = document.body): Result<T> {
  const uiElements = {} as T;

  for (const name in selectors) {
    const selector = selectors[name];
    const element = parentElement.querySelector(selector);

    if (!element) {
      return makeErr(`Element not found by selector: "${selector}"`);
    }

    uiElements[name] = element as any;
  }

  return uiElements;
}
