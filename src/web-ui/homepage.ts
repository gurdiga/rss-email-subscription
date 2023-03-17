import { ApiPath } from '../domain/api-path';
import { CheckFeedUrlRequestData, CheckFeedUrlResponseData } from '../domain/feed';
import { isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import {
  clearValidationErrors,
  displayValidationError,
  hideElement,
  HttpMethod,
  onClick,
  onInput,
  onSubmit,
  reportError,
  requireUiElements,
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
  addCopyButton(rssUrlContainer);
  onInput(blogUrlField, () => hideElement(successMessage));
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
      unhideElement(successMessage);
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

function addCopyButton(sourceElement: HTMLElement): void {
  const initialButtonLabel = 'Copy';
  const button = createElement('button', initialButtonLabel, { type: 'button' });

  sourceElement.insertAdjacentElement('afterend', button);

  onClick(button, async () => {
    const type = 'text/plain';
    const blob = new Blob([sourceElement.textContent!], { type });
    const data = [new ClipboardItem({ [type]: blob })];

    await navigator.clipboard.write(data);
    button.textContent = 'Copied!';
    setTimeout(() => (button.textContent = initialButtonLabel), 500);
  });
}

interface UiElements {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  blogUrlField: HTMLInputElement;
  successMessage: HTMLElement;
  rssUrlContainer: HTMLElement;
}

main();
