import { ApiResponse } from '../shared/api-response';
import { isErr } from '../shared/lang';
import { fillUiElements, parseConfirmationLinkUrlParams, requireUiElements, UiElementFillSpec } from './utils';

interface UnsubscriptionUiElements {
  feedNameLabel: Element;
  emailLabel: Element;
  confirmButton: Element;
  unsubscriptionSuccessLabel: Element;
  inputErrorLabel: Element;
  appErrorLabel: Element;
  communicationErrorLabel: Element;
}

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayMainError(queryParams.reason);
    // TODO: Add a explanatory message about the unsubscribe link in the email.
    return;
  }

  const uiElements = requireUiElements<UnsubscriptionUiElements>({
    feedNameLabel: '#feed-name-label',
    emailLabel: '#email-label',
    confirmButton: '#confirm-button',
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

  uiElements.confirmButton.addEventListener('click', () => {
    sendUnsubscribeRequest({ id: queryParams.id })
      .then(handleUnsubscribeResponse)
      .catch((e) => {
        console.error('Got error from the API', e);
      });
  });

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

interface UnsubscribeRequest {
  id: string;
}

function sendUnsubscribeRequest(unsubscribeRequest: UnsubscribeRequest): Promise<UnsubscribeResponse> {
  var formData = new URLSearchParams();

  formData.append('id', unsubscribeRequest.id);

  return fetch('/unsubscribe', {
    method: 'POST',
    body: formData,
  })
    .then((r) => r.json())
    .then((json) => json as UnsubscribeResponse);
}

type UnsubscribeResponse = ApiResponse;

function handleUnsubscribeResponse(unsubscribeResponse: UnsubscribeResponse): void {
  console.log('handleUnsubscribeResponse', unsubscribeResponse);
}
