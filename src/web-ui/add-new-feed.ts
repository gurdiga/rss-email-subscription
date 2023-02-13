import { isAppError, isInputError } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { PagePaths } from '../shared/page-paths';
import { clearValidationErrors, displayInitError, displayValidationError, HttpMethod, navigateTo } from './shared';
import { requireUiElements, sendApiRequest } from './shared';

async function main() {
  const uiElements = requireUiElements<UiElements>({
    displayName: '#feed-name-field',
    url: '#feed-url-field',
    id: '#feed-id-field',
    replyTo: '#feed-reply-to-field',
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  uiElements.submitButton.addEventListener('click', (event: Event) => {
    event.preventDefault();

    const result = submitForm(uiElements);

    if (isErr(result)) {
      return;
    }

    if (!'TODO: remove this if') {
      navigateTo(PagePaths.feedList);
    }
  });
}

type MakeFeedRequest = Record<'displayName' | 'url' | 'id' | 'replyTo', string>;

async function submitForm(uiElements: UiElements): Promise<Result<void>> {
  clearValidationErrors(uiElements);

  const makeFeedRequest: MakeFeedRequest = {
    displayName: uiElements.displayName.value,
    id: uiElements.id.value,
    url: uiElements.url.value,
    replyTo: uiElements.replyTo.value,
  };

  const response = await asyncAttempt(() => sendApiRequest('/feeds/add-new-feed', HttpMethod.POST, makeFeedRequest));

  if (isErr(response)) {
    return response;
  }

  if (isAppError(response)) {
    return makeErr('Application error when loading the feed');
  }

  if (isInputError(response)) {
    displayValidationError(response, uiElements);
    return makeErr('Input error when loading the feed');
  }
}

interface UiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

interface FormFields {
  displayName: HTMLInputElement;
  url: HTMLInputElement;
  id: HTMLInputElement;
  replyTo: HTMLInputElement;
}

globalThis.window && main();
