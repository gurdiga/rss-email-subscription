import { isErr } from '../shared/lang';
import { parseConfirmationLinkUrlParams, requireUiElements } from './utils';

interface UnsubscriptionUiElements {
  feedNameLabel: Element;
  emailLabel: Element;
  subscriptionIdFormField: Element;
  unsubscriptionSuccessLabel: Element;
  inputErrorLabel: Element;
  appErrorLabel: Element;
  communicationErrorLabel: Element;
}

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayInitError(queryParams.reason);
    return;
  }

  const uiElements = requireUiElements<UnsubscriptionUiElements>({
    feedNameLabel: '#feed-name-label',
    emailLabel: '#email-label',
    subscriptionIdFormField: 'form input[name="id"]',
    unsubscriptionSuccessLabel: '#unsubscription-success-label',
    inputErrorLabel: '#input-error-label',
    appErrorLabel: '#app-error-label',
    communicationErrorLabel: '#communication-error-label',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  console.log({ queryParams, uiElements });

  /**
   * TODO:
   * - fill in the feed name and email labels
   * - wire up form submit
   * - handle submit results
   */
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
