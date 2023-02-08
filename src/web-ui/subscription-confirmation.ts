import { isErr } from '../shared/lang';
import { displayInitError, fillUiElements, displayApiResponse, HttpMethod } from './shared';
import { displayCommunicationError, parseConfirmationLinkUrlParams, requireUiElements } from './shared';
import { ApiResponseUiElements, sendApiRequest, UiElementFillSpec } from './shared';

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayInitError('Invalid subscription confirmation link');
    return;
  }

  const uiElements = requireUiElements<SubscriptionConfirmationUiElements>({
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

  uiElements.inputUiContainer.removeAttribute('hidden');
  uiElements.formUiContainer.removeAttribute('hidden');

  uiElements.confirmButton.addEventListener('click', async () => {
    try {
      const response = await sendApiRequest('/subscription-confirmation', HttpMethod.POST, { id: queryParams.id });

      displayApiResponse(response, uiElements.apiResponseMessage);
    } catch (error) {
      displayCommunicationError(error, uiElements.apiResponseMessage);
    }
  });
}

main();

interface SubscriptionConfirmationUiElements extends InputUiElements, FormUiElements, ApiResponseUiElements {}

interface InputUiElements {
  inputUiContainer: Element;
  feedNameLabel: Element;
  emailLabel: Element;
}

interface FormUiElements {
  formUiContainer: Element;
  confirmButton: Element;
}
