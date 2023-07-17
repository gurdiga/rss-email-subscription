import { ApiPath } from '../domain/api-path';
import { CheckFeedUrlRequest, CheckFeedUrlRequestData, CheckFeedUrlResponseData } from '../domain/feed';
import { isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import {
  HttpMethod,
  clearInitError,
  clearValidationErrors,
  displayInitError,
  displayValidationError,
  hideElement,
  isAuthenticated,
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
    successMessageCta: '#rss-check-success-cta',
    feedCountWording: '#feed-count-wording',
    rssUrlContainer: '#feed-checker-rss-url-container',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const { blogUrlField, submitButton, rssUrlContainer, feedCountWording, successMessage, successMessageCta } =
    uiElements;

  onInput(blogUrlField, () => {
    hideElement(successMessage);
    unhideElement(submitButton);
  });

  onSubmit(submitButton, async () => {
    clearValidationErrors(uiElements);
    clearInitError();

    const requestData: CheckFeedUrlRequestData = {
      blogUrl: uiElements.blogUrlField.value,
    };

    const formFieldName: keyof FormFields = 'blogUrlField';
    const responseFieldName: keyof CheckFeedUrlRequest = 'blogUrl';

    const path = ApiPath.checkFeedUrl;
    const response = await asyncAttempt(() =>
      sendApiRequest<CheckFeedUrlResponseData>(path, HttpMethod.POST, requestData)
    );

    if (isErr(response)) {
      displayInitError(response.reason);
      return;
    }

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
      renderFeedUrls(rssUrlContainer, feedUrls);
      hideElement(submitButton);
      unhideElement(successMessage);
      scrollIntoView(successMessage);

      if (!isAuthenticated()) {
        unhideElement(successMessageCta);
      }

      return;
    }

    reportAppError(si`Unhandled response type: ${JSON.stringify(response)}`);
  });
}

function renderFeedUrls(rssUrlContainer: HTMLElement, feedUrls: string[]): void {
  feedUrls.forEach((url) => {
    rssUrlContainer.append(createElement('div', url, { class: 'my-2' }));
  });
}

interface UiElements extends FormFields {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  successMessage: HTMLElement;
  successMessageCta: HTMLElement;
  feedCountWording: HTMLElement;
  rssUrlContainer: HTMLElement;
}

interface FormFields {
  blogUrlField: HTMLInputElement;
}

main();
