import { UiFeed, UiFeedListItem } from '../domain/feed';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { PagePaths } from '../shared/page-paths';
import { si } from '../shared/string-utils';
import { displayInitError, HttpMethod, requireQueryStringParams, requireUiElements, sendApiRequest } from './shared';

async function main() {
  const queryStringParams = requireQueryStringParams<QueryStringParams>({
    id: 'id',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<UiElements>({
    spinner: '#spinner',
    feedAttributeList: '#feed-attribute-list',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const feed = await loadFeed(queryStringParams.id);

  uiElements.spinner.remove();

  if (isErr(feed)) {
    displayInitError(feed.reason);
    return;
  }

  displayFeedAttributeList(feed, uiElements);
}

async function loadFeed<T = UiFeed>(id: string): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(si`/feeds/${id}`, HttpMethod.GET));

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

function displayFeedAttributeList(_feed: UiFeed, _uiElements: UiElements): void {
  // const feedListData = buildFeedListData(uiFeedList);
  // feedListPreamble.textContent = feedListData.preambleMessage;
  // feedListPreamble.removeAttribute('hidden');
  // if (feedListData.linkData) {
  //   const htmlListItems = feedListData.linkData.map(makeHtmlListItem);
  //   feedList.append(...htmlListItems);
  //   feedList.removeAttribute('hidden');
  // }
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

makeHtmlListItem;
function makeHtmlListItem(data: FeedLinkData): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');

  a.textContent = data.text;
  a.href = data.href;

  li.append(a);

  return li;
}

interface UiElements {
  spinner: HTMLElement;
  feedAttributeList: HTMLElement;
}

interface QueryStringParams {
  id: string;
}

globalThis.window && main();
