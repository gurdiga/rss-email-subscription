import { UiFeedListItem } from '../domain/feed';
import { isAppError, isInputError, isNotAuthenticatedError } from '../shared/api-response';
import { attempt, isErr, makeErr, Result } from '../shared/lang';
import { PagePaths } from '../shared/page-paths';
import { si } from '../shared/string-utils';
import { AppStatusUiElements, displayMainError, HttpMethod, requireUiElements, sendApiRequest } from './shared';

async function main() {
  const uiElements = requireUiElements<UiElements>({
    spinner: '#spinner',
    feedListPreamble: '#feed-list-preamble',
    feedList: 'ol#feed-list',
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
  displayFeedList(feedList, uiElements);
}

function displayFeedList(feedList: UiFeedListItem[], uiElements: FeedListUiElements): void {
  if (feedList.length === 0) {
    uiElements.feedListPreamble.textContent = 'You don’t have any feeds yet. Go ahead and add one!';
    uiElements.feedListPreamble.removeAttribute('hidden');
    return;
  }

  const pluralSuffix = feedList.length === 1 ? '' : 's';
  const message = si`You have ${feedList.length} feed${pluralSuffix} registered at the moment.`;
  const feedListItems = feedList.map(makeFeedListItem);

  uiElements.feedListPreamble.textContent = message;
  uiElements.feedListPreamble.removeAttribute('hidden');

  uiElements.feedList.append(...feedListItems);
  uiElements.feedList.removeAttribute('hidden');
}

function makeFeedListItem(item: UiFeedListItem): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');

  const hrefParams = new URLSearchParams({ id: item.feedId.value }).toString();
  const href = si`${PagePaths.feedManage}?${hrefParams}`;

  a.textContent = item.displayName;
  a.href = href;

  li.append(a);

  return li;
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

interface UiElements extends AppStatusUiElements, FeedListUiElements {
  spinner: HTMLElement;
}

interface FeedListUiElements {
  feedListPreamble: HTMLElement;
  feedList: HTMLOListElement;
}

globalThis.window && main();
