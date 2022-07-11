import { isErr } from '../shared/lang';
import { parseConfirmationLinkUrlParams, requireUiElements } from './utils';

interface UnsubscriptionUiElements {
  errorMessage: Element;
}

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayInitError(queryParams.reason);
    return;
  }

  const uiElements = requireUiElements<UnsubscriptionUiElements>({
    errorMessage: '#tbd-selector',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  console.log({ queryParams, uiElements });

  /**

  Tentative steps:

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

function displayInitError(message: string) {
  const initErrorElementSelector = '#init-error-message';
  const errorMessageElement = document.querySelector(initErrorElementSelector);

  if (!errorMessageElement) {
    console.error(`Element is missing: ${initErrorElementSelector}`);
    return;
  }

  errorMessageElement.textContent = message;
  errorMessageElement.removeAttribute('hidden');
}
