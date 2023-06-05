import { ApiPath } from '../domain/api-path';
import { UnsubscriptionConfirmationRequestData } from '../domain/subscription-id';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  fillUiElements,
  HttpMethod,
  onClick,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  UiElementFillSpec,
  UiElementsBase,
  unhideElement,
} from './shared';

function main() {
  const queryParams = requireQueryParams<RequiredParams>({
    id: 'id',
    displayName: 'displayName',
    email: 'email',
  });

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

  onClick(uiElements.confirmButton, async () => {
    const request: UnsubscriptionConfirmationRequestData = { id: queryParams.id };
    const response = await asyncAttempt(() => sendApiRequest(ApiPath.unsubscription, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, uiElements.apiResponseMessage);
      return;
    }

    displayApiResponse(response, uiElements.apiResponseMessage);
  });
}

main();

interface RequiredParams {
  id: string;
  displayName: string;
  email: string;
}

interface RequiredUiElements extends UiElementsBase, InputUiElements, FormUiElements, ApiResponseUiElements {}

interface InputUiElements {
  inputUiContainer: HTMLElement;
  feedNameLabel: HTMLElement;
  emailLabel: HTMLElement;
}

interface FormUiElements {
  formUiContainer: HTMLElement;
  confirmButton: HTMLElement;
}
