import { UiFeedListItem } from '../domain/feed';
import { isAppError, isInputError, isNotAuthenticatedError } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
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

  const uiFeedList = await loadUiFeedList();

  uiElements.spinner.remove();

  if (isErr(uiFeedList)) {
    displayMainError(uiFeedList.reason);
    return;
  }

  displayFeedList(uiFeedList, uiElements);
}

function displayFeedList(uiFeedList: UiFeedListItem[], uiElements: FeedListUiElements): void {
  const { feedListPreamble, feedList } = uiElements;
  const feedListData = buildFeedListData(uiFeedList);

  feedListPreamble.textContent = feedListData.preambleMessage;
  feedListPreamble.removeAttribute('hidden');

  if (feedListData.linkData) {
    const htmlListItems = feedListData.linkData.map(makeHtmlListItem);

    feedList.append(...htmlListItems);
    feedList.removeAttribute('hidden');
  }
}

export interface FeedListData {
  preambleMessage: string;
  linkData?: FeedLinkData[];
}

interface FeedLinkData {
  text: string;
  href: string;
}

export function buildFeedListData(feedList: UiFeedListItem[]): FeedListData {
  const pluralSuffix = feedList.length === 1 ? '' : 's';

  return isEmpty(feedList)
    ? { preambleMessage: 'You don’t have any feeds yet. Go ahead and add one!' }
    : {
        preambleMessage: si`You have ${feedList.length} feed${pluralSuffix} registered at the moment.`,
        linkData: feedList.map(makeLinkData),
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

async function loadUiFeedList<L = UiFeedListItem[]>(): Promise<Result<L>> {
  const response = await asyncAttempt(() => sendApiRequest<L>('/feeds', HttpMethod.GET));

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
