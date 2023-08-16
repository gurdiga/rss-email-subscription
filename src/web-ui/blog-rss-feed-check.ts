import { ApiPath } from '../domain/api-path';
import {
  CheckFeedUrlRequestData,
  CheckFeedUrlResponseData,
  PublicShowSampleEmailRequestData,
  PublicShowSampleEmailResponse,
} from '../domain/feed';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  HttpMethod,
  clearInitError,
  clearValidationErrors,
  displayApiResponse,
  displayInitError,
  displayValidationError,
  hideElement,
  isAuthenticated,
  onClick,
  onEscape,
  onInput,
  onSubmit,
  reportAppError,
  reportUnexpectedEmptyResponseData,
  requireUiElements,
  scrollIntoView,
  sendApiRequest,
  toggleElement,
  unhideElement,
} from './shared';

function main() {
  const uiElements = requireUiElements<UiElements>({
    form: '#feed-checker-form',
    blogUrlField: '#feed-checker-field',
    submitButton: '#feed-checker-button',
    successMessage: '#feed-checker-success-message',
    feedCheckApiErrorMessage: '#feed-check-api-error-message',
    rssUrlContainer: '#rss-url-container',
    showSampleEmailButton: '#show-sample-email-button',
    emailFieldContainer: '#email-field-container',
    emailField: '#email-field',
    submitSampleEmailButton: '#submit-sample-email-button',
    cancelButton: '#cancel-button',
    sampleEmailSentMessage: '#sample-email-sent-message',
    sampleEmailApiErrorMessage: '#sample-email-api-error-message',
    sampleEmailSender: '#sample-email-sender',
    sampleEmailSubject: '#sample-email-subject',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  initMainForm(uiElements);
  initSampleEmailForm(uiElements);
}

function initSampleEmailForm(uiElements: SampleEmailFormElements) {
  const { showSampleEmailButton, emailFieldContainer, emailField, submitSampleEmailButton, cancelButton } = uiElements;
  const { rssUrlContainer, sampleEmailSentMessage, sampleEmailApiErrorMessage, sampleEmailSender, sampleEmailSubject } =
    uiElements;

  onClick(showSampleEmailButton, () => {
    hideElement(showSampleEmailButton);
    unhideElement(emailFieldContainer);
    emailField.focus();
    emailField.select();
  });

  onEscape(emailField, () => dismissSampleEmailForm(uiElements));
  onInput(emailField, () => {
    clearValidationErrors({ emailField });
    hideElement(sampleEmailSentMessage);
  });

  onClick(cancelButton, () => dismissSampleEmailForm(uiElements));

  onSubmit(submitSampleEmailButton, async () => {
    clearValidationErrors({ emailField });
    hideElement(sampleEmailApiErrorMessage);

    const path = ApiPath.showSampleEmailPublic;
    const requestData: PublicShowSampleEmailRequestData = {
      feedUrl: rssUrlContainer.textContent || '',
      recipientEmail: emailField.value,
    };

    const response = await asyncAttempt(() =>
      sendApiRequest<PublicShowSampleEmailResponse>(path, HttpMethod.POST, requestData)
    );

    if (isErr(response)) {
      displayInitError(response.reason);
      return;
    }

    if (isAppError(response)) {
      displayApiResponse(response, sampleEmailApiErrorMessage);
      return;
    }

    if (isInputError(response)) {
      const responseFieldName: keyof typeof requestData = 'recipientEmail';

      // ASSUMPTION: There will never be an error for the requestData.feedUrl
      displayValidationError(response, { [responseFieldName]: emailField });
      return;
    }

    const { responseData } = response;

    if (!responseData) {
      reportUnexpectedEmptyResponseData(path);
      displayInitError('Application error');
      return;
    }

    sampleEmailSender.textContent = responseData.sender;
    sampleEmailSubject.textContent = responseData.emailSubject;
    unhideElement(sampleEmailSentMessage);
    scrollIntoView(sampleEmailSentMessage);
  });
}

function dismissSampleEmailForm(uiElements: SampleEmailFormElements): void {
  const { emailFieldContainer, sampleEmailSentMessage, showSampleEmailButton, sampleEmailApiErrorMessage } = uiElements;

  hideElement(emailFieldContainer);
  unhideElement(showSampleEmailButton);
  hideElement(sampleEmailSentMessage);
  hideElement(sampleEmailApiErrorMessage);
}

function initMainForm(uiElements: UiElements) {
  const { blogUrlField, submitButton, successMessage, rssUrlContainer, showSampleEmailButton } = uiElements;
  const { feedCheckApiErrorMessage } = uiElements;

  onInput(blogUrlField, () => dismissMainForm(uiElements));

  onSubmit(submitButton, async () => {
    clearValidationErrors({ blogUrlField });
    clearInitError();
    hideElement(feedCheckApiErrorMessage);

    const requestData: CheckFeedUrlRequestData = {
      blogUrl: blogUrlField.value,
    };

    const path = ApiPath.checkFeedUrl;
    const response = await asyncAttempt(() =>
      sendApiRequest<CheckFeedUrlResponseData>(path, HttpMethod.POST, requestData)
    );

    if (isErr(response)) {
      displayInitError(response.reason);
      return;
    }

    if (isAppError(response)) {
      displayApiResponse(response, feedCheckApiErrorMessage);
      return;
    }

    if (isInputError(response)) {
      const responseFieldName: keyof typeof requestData = 'blogUrl';
      displayValidationError(response, { [responseFieldName]: blogUrlField });
      return;
    }

    if (isSuccess(response)) {
      if (!response.responseData) {
        reportUnexpectedEmptyResponseData(path);
        return;
      }

      const { feedUrl } = response.responseData;

      hideElement(submitButton);
      rssUrlContainer.textContent = feedUrl;
      unhideElement(successMessage);
      toggleElement(!isAuthenticated(), showSampleEmailButton);
      scrollIntoView(successMessage);
      return;
    }

    reportAppError(si`Unhandled response type: ${JSON.stringify(response)}`);
  });
}

function dismissMainForm(uiElements: UiElements) {
  const { blogUrlField, successMessage, submitButton, feedCheckApiErrorMessage } = uiElements;

  clearValidationErrors({ blogUrlField });
  dismissSampleEmailForm(uiElements);
  hideElement(successMessage);
  hideElement(feedCheckApiErrorMessage);
  unhideElement(submitButton);
}

interface UiElements extends MainFormFields, SampleEmailFormElements {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  successMessage: HTMLElement;
}

interface SampleEmailFormElements {
  rssUrlContainer: HTMLElement;
  showSampleEmailButton: HTMLButtonElement;
  emailFieldContainer: HTMLFormElement;
  emailField: HTMLInputElement;
  submitSampleEmailButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  sampleEmailSentMessage: HTMLElement;
  sampleEmailSender: HTMLElement;
  sampleEmailSubject: HTMLElement;
  sampleEmailApiErrorMessage: HTMLElement;
}

interface MainFormFields {
  blogUrlField: HTMLInputElement;
  feedCheckApiErrorMessage: HTMLElement;
}

main();
