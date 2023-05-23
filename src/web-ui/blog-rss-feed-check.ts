import { ApiPath } from '../domain/api-path';
import { CheckFeedUrlRequestData, CheckFeedUrlResponseData } from '../domain/feed';
import { isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  HttpMethod,
  clearValidationErrors,
  displayValidationError,
  hideElement,
  onInput,
  onSubmit,
  reportError,
  requireUiElements,
  scrollIntoView,
  sendApiRequest,
  unhideElement,
} from './shared';

function main() {
  const uiElements = requireUiElements<UiElements>({
    form: '#feed-checker-form',
    blogUrlField: '#feed-checker-field',
    submitButton: '#feed-checker-button',
    successMessage: '#feed-checker-success-message',
    rssUrlContainer: '#feed-checker-rss-url-container',
  });

  if (isErr(uiElements)) {
    reportError(uiElements.reason);
    return;
  }

  const { form, blogUrlField, submitButton, rssUrlContainer, successMessage } = uiElements;

  unhideElement(form);
  onInput(blogUrlField, () => {
    hideElement(successMessage);
    unhideElement(submitButton);
  });
  onSubmit(submitButton, async () => {
    clearValidationErrors(uiElements);

    const response = await submitForm(uiElements);
    const formFields: Record<keyof CheckFeedUrlResponseData, HTMLElement> = {
      feedUrl: blogUrlField,
    };

    if (isInputError(response)) {
      displayValidationError(response, formFields);
      return;
    }

    if (isSuccess(response)) {
      rssUrlContainer.textContent = response.responseData?.feedUrl!;
      hideElement(submitButton);
      unhideElement(successMessage);
      scrollIntoView(successMessage);
      return;
    }

    reportError(si`Unhandled response type: ${JSON.stringify(response)}`);
  });
}

async function submitForm(formFields: UiElements) {
  const makeFeedRequest: CheckFeedUrlRequestData = {
    blogUrl: formFields.blogUrlField.value,
  };

  return await asyncAttempt(() =>
    sendApiRequest<CheckFeedUrlResponseData>(ApiPath.checkFeedUrl, HttpMethod.POST, makeFeedRequest)
  );
}

interface UiElements {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  blogUrlField: HTMLInputElement;
  successMessage: HTMLElement;
  rssUrlContainer: HTMLElement;
}

main();
