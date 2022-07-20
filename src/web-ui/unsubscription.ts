import { isErr } from '../shared/lang';
import { fillUiElements, parseConfirmationLinkUrlParams, requireUiElements, UiElementFillSpec } from './utils';

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
    displayMainError(queryParams.reason);
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
    displayMainError(uiElements.reason);
    return;
  }

  const fillUiResult = fillUiElements([
    <UiElementFillSpec<HTMLSpanElement>>{
      element: uiElements.feedNameLabel,
      propName: 'textContent',
      value: queryParams.displayName,
    },
    <UiElementFillSpec<HTMLSpanElement>>{
      element: uiElements.emailLabel,
      propName: 'textContent',
      value: queryParams.email,
    },
  ]);

  if (isErr(fillUiResult)) {
    displayMainError(fillUiResult.reason);
    return;
  }

  console.log({ queryParams, uiElements });

  /**
    TODO:
    - wire up form submit
    - handle submit results
   */
}

main();

function displayMainError(message: string) {
  const initErrorElementSelector = '#init-error-message';
  const errorMessageElement = document.querySelector(initErrorElementSelector);

  if (!errorMessageElement) {
    console.error(`Element is missing: ${initErrorElementSelector}`);
    return;
  }

  errorMessageElement.textContent = message;
  errorMessageElement.removeAttribute('hidden');
}
