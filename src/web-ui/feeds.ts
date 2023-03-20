import { LoadFeedsResponseData, UiFeedListItem } from '../domain/feed';
import { FeedManageParams, makePagePathWithParams, PagePath } from '../domain/page-path';
import { ApiPath } from '../domain/api-path';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty, sortBy } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  displayInitError,
  HttpMethod,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
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
  const feedListData = makeFeedListData(uiFeedList);

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

export function makeFeedListData(feedList: UiFeedListItem[]): FeedListData {
  const pluralSuffix = feedList.length === 1 ? '' : 's';

  return isEmpty(feedList)
    ? { preambleMessage: 'You don’t have any blog feeds yet. Go ahead and add one!' }
    : {
        preambleMessage: si`You have ${feedList.length} blog feed${pluralSuffix} registered at the moment.`,
        linkData: feedList.map(makeLinkData).sort(sortBy((x) => x.text)),
      };
}

function makeLinkData(item: UiFeedListItem): FeedLinkData {
  const text = item.displayName;
  const href = makePagePathWithParams<FeedManageParams>(PagePath.feedManage, { id: item.feedId.value });

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

async function loadUiFeedList(): Promise<Result<UiFeedListItem[]>> {
  const response = await asyncAttempt(() => sendApiRequest<LoadFeedsResponseData>(ApiPath.loadFeeds, HttpMethod.GET));

  if (isErr(response)) {
    return makeErr(si`Failed to load the feed list: ${response.reason}`);
  }

  if (isAppError(response)) {
    return makeErr('Application error when loading the feed list');
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed list');
  }

  return response.responseData!;
}

interface RequiredUiElements extends FeedListUiElements, SpinnerUiElements {}

interface FeedListUiElements {
  feedListPreamble: HTMLElement;
  feedList: HTMLOListElement;
}

globalThis.window && main();
