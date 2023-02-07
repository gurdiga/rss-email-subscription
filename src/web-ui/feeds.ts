import { UiFeedListItem } from '../domain/feed';
import { isAppError, isInputError, isNotAuthenticatedError } from '../shared/api-response';
import { attempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { AppStatusUiElements, displayMainError, HttpMethod, requireUiElements, sendApiRequest } from './shared';

async function main() {
  const uiElements = requireUiElements<FeedListUiElements>({
    spinner: '#spinner',
    feedListPreamble: '#feed-list-preamble',
    feedList: '#feed-list',
    addNewFeedButton: '#add-new-feed-button',
    apiResponseMessage: '#api-response-message',
    appErrorMessage: '#app-error-message',
  });

  if (isErr(uiElements)) {
    displayMainError(uiElements.reason);
    return;
  }

  const feedList = await loadFeedList();

  if (isErr(feedList)) {
    displayMainError(feedList.reason);
    return;
  }

  uiElements.spinner.remove();
  uiElements.feedListPreamble.textContent =
    feedList.length > 0
      ? si`You have ${feedList.length} feed${feedList.length === 1 ? '' : 's'} registered at the moment.`
      : 'You don’t have any feeds yet. Go ahead and add one!';

  console.info('Hello feeds!', { uiElements, feedList }); // TODO: Remove this
}

async function loadFeedList<L = UiFeedListItem[]>(): Promise<Result<L>> {
  const response = await attempt(() => sendApiRequest<L>('/feeds', HttpMethod.GET));

  if (isErr(response)) {
    return makeErr('Failed to load the feed list');
  }

  if (isNotAuthenticatedError(response)) {
    return makeErr('Not authenticated');
  }

  if (isAppError(response)) {
    return makeErr('Application error when loading the feed list');
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed list');
  }

  return response.responseData!;
}

export interface FeedListUiElements extends AppStatusUiElements {
  spinner: HTMLElement;
  feedListPreamble: HTMLElement;
  feedList: HTMLElement;
  addNewFeedButton: HTMLElement;
}

globalThis.window && main();
