import { MakeFeedRequest, MakeFeedResponseData } from '../domain/feed';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { makePagePathWithParams, PagePath } from '../domain/page-path';
import {
  ApiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  preventDoubleClick,
} from './shared';
import { displayInitError, displayValidationError, HttpMethod, navigateTo, requireUiElements } from './shared';
import { sendApiRequest } from './shared';

async function main() {
  const uiElements = requireUiElements<UiElements>({
    displayName: '#feed-name-field',
    url: '#feed-url-field',
    id: '#feed-id-field',
    replyTo: '#feed-reply-to-field',
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await submitForm(uiElements);

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

        setTimeout(() => {
          const nextPageParams = { id: response.responseData?.feedId! };
          const nextPage = makePagePathWithParams(PagePath.feedManage, nextPageParams);

          navigateTo(nextPage);
        }, 1000);
      }
    });
  });
}

async function submitForm(formFields: FormFields) {
  const makeFeedRequest: MakeFeedRequest = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
  };

  return await asyncAttempt(() =>
    sendApiRequest<MakeFeedResponseData>('/feeds/add-new-feed', HttpMethod.POST, makeFeedRequest)
  );
}

interface UiElements extends FormFields, ApiResponseUiElements {
  submitButton: HTMLButtonElement;
}

interface FormFields {
  displayName: HTMLInputElement;
  url: HTMLInputElement;
  id: HTMLInputElement;
  replyTo: HTMLInputElement;
}

globalThis.window && main();
