import { makeFeedId } from '../domain/feed-id';
import { FeedSubscribeFormParams } from '../domain/page-path';
import { isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  breadcrumbsUiElements,
  BreadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
  makeFeedManageBreadcrumbsLink,
} from './breadcrumbs';
import { requireQueryParams, displayInitError, requireUiElements, onClick } from './shared';

function main() {
  const queryStringParams = requireQueryParams<FeedSubscribeFormParams>({
    id: 'id',
    displayName: 'displayName',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const feedId = makeFeedId(queryStringParams.id);

  if (isErr(feedId)) {
    displayInitError(si`Invalid feed ID: ${feedId.reason}`);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...breadcrumbsUiElements,
    scriptContainer: '#script-container',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const { scriptContainer } = uiElements;

  scriptContainer.value =
    si`<script res-subscription-form data-feed-id="${feedId.value}"` +
    si` src="${location.origin}/web-ui-scripts/web-ui/subscription-form.js">` +
    si`</script>`;

  onClick(scriptContainer, () => {
    scriptContainer.select();
    document.execCommand('copy');
  });

  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(queryStringParams.displayName, feedId),
    {
      label: uiElements.pageTitle.textContent!,
    },
  ]);
}

interface RequiredUiElements extends BreadcrumbsUiElements {
  scriptContainer: HTMLTextAreaElement;
}

main();
