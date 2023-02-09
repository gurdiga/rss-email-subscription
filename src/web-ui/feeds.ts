import { UiFeedListItem } from '../domain/feed';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { PagePaths } from '../shared/page-paths';
import { si } from '../shared/string-utils';
import { displayInitError, HttpMethod, requireUiElements, sendApiRequest, unhideElement } from './shared';

async function main() {
  const uiElements = requireUiElements<UiElements>({
    spinner: '#spinner',
    feedListPreamble: '#feed-list-preamble',
    feedList: 'ol#feed-list',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const uiFeedList = await loadUiFeedList();

  uiElements.spinner.remove();

  if (isErr(uiFeedList)) {
    displayInitError(uiFeedList.reason);
    return;
  }

  displayFeedList(uiFeedList, uiElements);
}

function displayFeedList(uiFeedList: UiFeedListItem[], uiElements: FeedListUiElements): void {
  const { feedListPreamble, feedList } = uiElements;
  const feedListData = buildFeedListData(uiFeedList);

  feedListPreamble.textContent = feedListData.preambleMessage;
  unhideElement(feedListPreamble);

  if (feedListData.linkData) {
    const htmlListItems = feedListData.linkData.map(makeHtmlListItem);

    feedList.append(...htmlListItems);
    unhideElement(feedList);
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

  if (isAppError(response)) {
    return makeErr('Application error when loading the feed list');
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed list');
  }

  return response.responseData!;
}

interface UiElements extends FeedListUiElements {
  spinner: HTMLElement;
}

interface FeedListUiElements {
  feedListPreamble: HTMLElement;
  feedList: HTMLOListElement;
}

globalThis.window && main();
