import { ApiPath } from '../domain/api-path';
import { SubscriptionConfirmationRequestData } from '../domain/subscription-id';
import { isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  fillUiElements,
  hideElement,
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
    displayInitError('Invalid subscription confirmation link');
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
    const request: SubscriptionConfirmationRequestData = { id: queryParams.id };
    const response = await asyncAttempt(() =>
      sendApiRequest(ApiPath.subscriptionConfirmation, HttpMethod.POST, request)
    );

    if (isErr(response)) {
      displayCommunicationError(response, uiElements.apiResponseMessage);
      return;
    }

    if (isSuccess(response)) {
      hideElement(uiElements.confirmButton);
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
