import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  fillUiElements,
  HttpMethod,
  parseConfirmationLinkUrlParams,
  requireUiElements,
  sendApiRequest,
  UiElementFillSpec,
  unhideElement,
} from './shared';

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  if (isErr(queryParams)) {
    displayInitError('Invalid unsubscribe link');
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    inputUiContainer: '#input-ui',
    feedNameLabel: '#feed-name-label',
    emailLabel: '#email-label',
    formUiContainer: '#form-ui',
    confirmButton: '#confirm-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const fillUiSpec: UiElementFillSpec[] = [
    {
      element: uiElements.feedNameLabel,
      propName: 'textContent',
      value: queryParams.displayName,
    },
    {
      element: uiElements.emailLabel,
      propName: 'textContent',
      value: queryParams.email,
    },
  ];

  const fillUiResult = fillUiElements(fillUiSpec);

  if (isErr(fillUiResult)) {
    displayInitError(fillUiResult.reason);
    return;
  }

  unhideElement(uiElements.inputUiContainer);
  unhideElement(uiElements.formUiContainer);

  uiElements.confirmButton.addEventListener('click', async () => {
    const response = await asyncAttempt(() =>
      sendApiRequest('/unsubscription', HttpMethod.POST, {
        id: queryParams.id,
        email: queryParams.email,
      })
    );

    if (isErr(response)) {
      displayCommunicationError(response, uiElements.apiResponseMessage);
      return;
    }

    displayApiResponse(response, uiElements.apiResponseMessage);
  });
}

main();

interface RequiredUiElements extends InputUiElements, FormUiElements, ApiResponseUiElements {}

interface InputUiElements {
  inputUiContainer: HTMLElement;
  feedNameLabel: HTMLElement;
  emailLabel: HTMLElement;
}

interface FormUiElements {
  formUiContainer: HTMLElement;
  confirmButton: HTMLElement;
}
