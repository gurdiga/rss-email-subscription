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
  const feedListData = buildFeedListData(feedList);

  uiElements.feedListPreamble.textContent = feedListData.preambleMessage;
  uiElements.feedListPreamble.removeAttribute('hidden');

  if (feedListData.shouldDisplayFeedList) {
    const htmlListItems = feedListData.linkData.map(makeHtmlListItem);

    uiElements.feedList.append(...htmlListItems);
    uiElements.feedList.removeAttribute('hidden');
  }
}

export interface FeedListData {
  preambleMessage: string;
  linkData: FeedLinkData[];
  shouldDisplayFeedList: boolean;
}

interface FeedLinkData {
  text: string;
  href: string;
}

export function buildFeedListData(feedList: UiFeedListItem[]): FeedListData {
  const pluralSuffix = feedList.length === 1 ? '' : 's';
  const preambleMessage =
    feedList.length === 0
      ? 'You don’t have any feeds yet. Go ahead and add one!'
      : si`You have ${feedList.length} feed${pluralSuffix} registered at the moment.`;

  const linkData = feedList.map(makeLinkData);
  const shouldDisplayFeedList = feedList.length > 0;

  return {
    preambleMessage,
    linkData,
    shouldDisplayFeedList,
  };
}

function makeLinkData(item: UiFeedListItem): FeedLinkData {
  const text = item.displayName;
  const hrefParams = new URLSearchParams({ id: item.feedId.value }).toString();
  const href = si`${PagePaths.feedManage}?${hrefParams}`;

  return { text, href };
}

function makeHtmlListItem(data: FeedLinkData): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');

  a.textContent = data.text;
  a.href = data.href;

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
