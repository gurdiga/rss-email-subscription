import { attempt, isErr, makeErr, Result } from '../shared/lang';
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

  console.info('Hello feeds!!', { uiElements, feedList });
}

// TODO: Move to ../shared ?
interface UiFeedList {
  name: string;
  feedId: string; // ...or FeedId?
}

async function loadFeedList(): Promise<Result<UiFeedList>> {
  const response = await attempt(() => sendApiRequest('/feeds', HttpMethod.GET));

  console.log('loadFeedList', { response });

  return makeErr('Not implemented');
}

export interface FeedListUiElements extends AppStatusUiElements {
  spinner: HTMLElement;
  feedListPreamble: HTMLElement;
  feedList: HTMLElement;
  addNewFeedButton: HTMLElement;
}

globalThis.window && main();
