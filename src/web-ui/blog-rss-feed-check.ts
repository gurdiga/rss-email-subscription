import { ApiPath } from '../domain/api-path';
import { CheckFeedUrlRequest, CheckFeedUrlRequestData, CheckFeedUrlResponseData } from '../domain/feed';
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
  reportAppError,
  reportUnexpectedEmptyResponseData,
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
    feedCountWording: '#feed-count-wording',
    rssUrlContainer: '#feed-checker-rss-url-container',
  });

  if (isErr(uiElements)) {
    reportAppError(uiElements.reason);
    return;
  }

  const { form, blogUrlField, submitButton, rssUrlContainer, feedCountWording, successMessage } = uiElements;

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
    const responseFieldName: keyof CheckFeedUrlRequest = 'blogUrl';

    const path = ApiPath.checkFeedUrl;
    const response = await asyncAttempt(() =>
      sendApiRequest<CheckFeedUrlResponseData>(path, HttpMethod.POST, requestData)
    );

    if (isInputError(response)) {
      displayValidationError(response, { [responseFieldName]: uiElements[formFieldName] });
      return;
    }

    if (isSuccess(response)) {
      if (!response.responseData) {
        reportUnexpectedEmptyResponseData(path);
        return;
      }

      const feedUrls = response.responseData.feedUrls.split(',');
      const feedCount = feedUrls.length;

      feedCountWording.textContent = feedCount == 1 ? 'is the feed' : si`are the ${feedCount} feeds`;
      rssUrlContainer.textContent = feedUrls.join('\n');
      hideElement(submitButton);
      unhideElement(successMessage);
      scrollIntoView(successMessage);
      return;
    }

    reportAppError(si`Unhandled response type: ${JSON.stringify(response)}`);
  });
}

interface UiElements extends FormFields {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  successMessage: HTMLElement;
  feedCountWording: HTMLElement;
  rssUrlContainer: HTMLElement;
}

interface FormFields {
  blogUrlField: HTMLInputElement;
}

main();
