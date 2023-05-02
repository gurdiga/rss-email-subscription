import { makeFeedId } from '../domain/feed-id';
import { isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
  makeFeedManageBreadcrumbsLink,
} from './breadcrumbs';
import {
  SpinnerUiElements,
  displayInitError,
  requireQueryParams,
  requireUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
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
    ...spinnerUiElements,
    report: '#report',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(queryStringParams.displayName, feedId),
    { label: uiElements.pageTitle.textContent! },
  ]);

  // TODO: Load report data

  uiElements.spinner.remove();

  unhideElement(uiElements.report);

  // TODO: Render report table
}

interface RequiredParams {
  id: string;
  displayName: string;
}

interface RequiredUiElements extends SpinnerUiElements, BreadcrumbsUiElements {
  report: HTMLElement;
}

main();
