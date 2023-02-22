import { asyncAttempt, isErr } from '../shared/lang';
import { displayInitError, fillUiElements, displayApiResponse, HttpMethod, unhideElement } from './shared';
import { displayCommunicationError, parseConfirmationLinkUrlParams, requireUiElements } from './shared';
import { ApiResponseUiElements, sendApiRequest, UiElementFillSpec } from './shared';

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayInitError('Invalid subscription confirmation link');
    return;
  }

  const uiElements = requireUiElements<UiElements>({
    inputUiContainer: '#input-ui',
    feedNameLabel: '#feed-name-label',
    emailLabel: '#email-label',
    formUiContainer: '#form-ui',
    confirmButton: '#confirm-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
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
    displayInitError(fillUiResult.reason);
    return;
  }

  unhideElement(uiElements.inputUiContainer);
  unhideElement(uiElements.formUiContainer);

  uiElements.confirmButton.addEventListener('click', async () => {
    const response = await asyncAttempt(() =>
      sendApiRequest('/subscription-confirmation', HttpMethod.POST, { id: queryParams.id })
    );

    if (isErr(response)) {
      displayCommunicationError(response, uiElements.apiResponseMessage);
      return;
    }

    displayApiResponse(response, uiElements.apiResponseMessage);
  });
}

main();

interface UiElements extends InputUiElements, FormUiElements, ApiResponseUiElements {}

interface InputUiElements {
  inputUiContainer: Element;
  feedNameLabel: Element;
  emailLabel: Element;
}

interface FormUiElements {
  formUiContainer: Element;
  confirmButton: Element;
}
