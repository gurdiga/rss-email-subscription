import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { ApiResponseUiElements, clearValidationErrors, displayApiResponse, displayCommunicationError } from './shared';
import { displayInitError, displayValidationError, HttpMethod, preventDoubleClick, requireQueryParams } from './shared';
import { requireUiElements, sendApiRequest, unhideElement } from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    id: 'id',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const feedId = makeFeedId(queryStringParams.id);

  if (isErr(feedId)) {
    displayInitError(si`Invalid feed ID: ${feedId.reason}`);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    spinner: '#spinner',
    form: '#feed-subscribers-form',
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const data = await loadSubscribersFormData(queryStringParams.id);

  uiElements.spinner.remove();

  if (isErr(data)) {
    displayInitError(data.reason);
    return;
  }

  fillForm(uiElements, data);
  unhideElement(uiElements.form);

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await submitForm(uiElements, feedId);

      if (isErr(response)) {
        displayCommunicationError(response, uiElements.apiResponseMessage);
        return;
      }

      if (isAppError(response)) {
        displayApiResponse(response, uiElements.apiResponseMessage);
        return;
      }

      if (isInputError(response)) {
        displayValidationError(response, uiElements);
        return;
      }

      if (isSuccess(response)) {
        displayApiResponse(response, uiElements.apiResponseMessage);
      }
    });
  });
}

interface SubscribersFormData {
  // TODO
}

function loadSubscribersFormData(_id: string): Result<SubscribersFormData> {
  // TODO
  return makeErr('Not implemented: loadSubscribersFormData');
}

function fillForm(_uiElements: RequiredUiElements, _data: SubscribersFormData): void {
  // TODO
}

interface UpdateSubscribersRequest {
  // TODO
}

export type UpdateSubscribersRequestData = Record<keyof UpdateSubscribersRequest, string>;

async function submitForm(_uiElements: RequiredUiElements, _feedId: FeedId) {
  const request: UpdateSubscribersRequestData = {};

  return await asyncAttempt(() => sendApiRequest<SubscribersFormData>('/feeds/edit-feed', HttpMethod.POST, request));
}

interface RequiredUiElements extends ApiResponseUiElements {
  spinner: HTMLElement;
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  // TODO
}

interface RequiredParams {
  id: string;
}

globalThis.window && main();
