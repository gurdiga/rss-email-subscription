import { EditFeedRequest, EditFeedResponseData, UiFeed } from '../domain/feed';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { makePagePathWithParams, PagePath } from '../domain/page-path';
import { ApiResponseUiElements, clearValidationErrors, displayApiResponse, displayCommunicationError } from './shared';
import { displayInitError, displayValidationError, HttpMethod, loadUiFeed, navigateTo } from './shared';
import { preventDoubleClick, requireQueryParams, requireUiElements, sendApiRequest, unhideElement } from './shared';
import { makeFeedId } from '../domain/feed-id';
import { si } from '../shared/string-utils';

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

  const uiElements = requireUiElements<UiElements>({
    spinner: '#spinner',
    form: '#edit-form',
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

  const uiFeed = await loadUiFeed(queryStringParams.id);

  uiElements.spinner.remove();

  if (isErr(uiFeed)) {
    displayInitError(uiFeed.reason);
    return;
  }

  fillForm(uiElements, uiFeed);
  unhideElement(uiElements.form);

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

function fillForm(uiElements: FormFields, uiFeed: UiFeed) {
  uiElements.displayName.value = uiFeed.displayName;
  uiElements.url.value = uiFeed.url;
  uiElements.id.value = uiFeed.id;
  uiElements.replyTo.value = uiFeed.replyTo;
}

async function submitForm(formFields: FormFields) {
  const editFeedRequest: EditFeedRequest = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
  };

  return await asyncAttempt(() =>
    sendApiRequest<EditFeedResponseData>('/feeds/edit-feed', HttpMethod.POST, editFeedRequest)
  );
}

interface UiElements extends FormFields, ApiResponseUiElements {
  spinner: HTMLElement;
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
}

interface FormFields {
  displayName: HTMLInputElement;
  url: HTMLInputElement;
  id: HTMLInputElement;
  replyTo: HTMLInputElement;
}

interface RequiredParams {
  id: string;
}

globalThis.window && main();
