import { isErr } from '../shared/lang';
import { displayMainError, fillUiElements, handleApiResponse } from './utils';
import { handleCommunicationError, parseConfirmationLinkUrlParams, requireUiElements } from './utils';
import { ResponseStatusUiElements, sendApiRequest, UiElementFillSpec } from './utils';

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayMainError('Invalid subscribe confirmation link');
    return;
  }

  const uiElements = requireUiElements<SubscriptionUiElements>({
    inputUiContainer: '#input-ui',
    feedNameLabel: '#feed-name-label',
    emailLabel: '#email-label',
    formUiContainer: '#form-ui',
    confirmButton: '#confirm-button',
    apiResponseMessage: '#api-response-message',
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

  uiElements.inputUiContainer.removeAttribute('hidden');
  uiElements.formUiContainer.removeAttribute('hidden');

  uiElements.confirmButton.addEventListener('click', async () => {
    try {
      const response = await sendApiRequest('/confirm-subscription', { id: queryParams.id });

      handleApiResponse(response, uiElements.apiResponseMessage);
    } catch (error) {
      handleCommunicationError(error, uiElements.apiResponseMessage);
    }
  });
}

main();

interface SubscriptionUiElements extends InputUiElements, FormUiElements, ResponseStatusUiElements {}

interface InputUiElements {
  inputUiContainer: Element;
  feedNameLabel: Element;
  emailLabel: Element;
}

interface FormUiElements {
  formUiContainer: Element;
  confirmButton: Element;
}
