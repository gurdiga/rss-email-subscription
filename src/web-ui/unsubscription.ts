import { ApiResponse, isAppError, isInputError } from '../shared/api-response';
import { isErr } from '../shared/lang';
import { fillUiElements, parseConfirmationLinkUrlParams, requireUiElements, UiElementFillSpec } from './utils';

interface UnsubscriptionUiElements extends InputUiElements, FormUiElements, ErrorUiElements, ResponseStatusUiElements {}

interface InputUiElements {
  feedNameLabel: Element;
  emailLabel: Element;
}

interface FormUiElements {
  confirmButton: Element;
}

interface ErrorUiElements {
  communicationErrorLabel: Element;
}

interface ResponseStatusUiElements {
  successLabel: Element;
  inputErrorLabel: Element;
  appErrorLabel: Element;
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
    communicationErrorLabel: '#communication-error-label',
    successLabel: '#unsubscription-success-label',
    inputErrorLabel: '#input-error-label',
    appErrorLabel: '#app-error-label',
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
      .then((unsubscribeResponse) => {
        handleApiResponse(unsubscribeResponse, uiElements);
      })
      .catch((error: TypeError) => {
        handleCommunicationError(error, uiElements);
      });
  });
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

function sendUnsubscribeRequest(unsubscribeRequest: UnsubscribeRequest): Promise<ApiResponse> {
  var formData = new URLSearchParams();

  formData.append('id', unsubscribeRequest.id);

  return fetch('/unsubscribe', {
    method: 'POST',
    body: formData,
  })
    .then((r) => r.json())
    .then((json) => json as ApiResponse);
}

function handleApiResponse(apiResponse: ApiResponse, uiElements: ResponseStatusUiElements): void {
  const { successLabel, appErrorLabel, inputErrorLabel } = uiElements;

  if (isInputError(apiResponse)) {
    inputErrorLabel.textContent = apiResponse.message;
    inputErrorLabel.removeAttribute('hidden');
    return;
  }

  if (isAppError(apiResponse)) {
    appErrorLabel.textContent = apiResponse.message;
    appErrorLabel.removeAttribute('hidden');
    return;
  }

  successLabel.removeAttribute('hidden');
}

function handleCommunicationError(error: TypeError, uiElements: ErrorUiElements): void {
  const { communicationErrorLabel } = uiElements;

  communicationErrorLabel.textContent = error.message;
  communicationErrorLabel.removeAttribute('hidden');
}
