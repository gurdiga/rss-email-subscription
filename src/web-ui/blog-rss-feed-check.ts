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

    const requestData: CheckFeedUrlRequestData = {
      blogUrl: uiElements.blogUrlField.value,
    };

    const formFieldName: keyof FormFields = 'blogUrlField';
    const responseFieldName: keyof CheckFeedUrlResponseData = 'feedUrl';

    const response = await asyncAttempt(() =>
      sendApiRequest<CheckFeedUrlResponseData>(ApiPath.checkFeedUrl, HttpMethod.POST, requestData)
    );

    if (isInputError(response)) {
      displayValidationError(response, { [responseFieldName]: formFieldName });
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

interface UiElements extends FormFields {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  successMessage: HTMLElement;
  rssUrlContainer: HTMLElement;
}

interface FormFields {
  blogUrlField: HTMLInputElement;
}

main();
