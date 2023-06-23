import { ApiPath } from '../domain/api-path';
import {
  DeliveryReportData,
  DeliveryReportResponse,
  DeliveryReportsRequestData,
  MessageCounts,
} from '../domain/delivery-reports';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError } from '../shared/api-response';
import { Result, asyncAttempt, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
  makeFeedManageBreadcrumbsLink,
} from './breadcrumbs';
import { createElement } from './dom-isolation';
import {
  HttpMethod,
  SpinnerUiElements,
  displayInitError,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
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
    noDeliveriesMessage: '#no-deliveries-message',
    report: '#report',
    tbody: '#tbody',
    upgdrageLink: '#upgrade-link',
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

  const response = await loadReports(feedId);

  uiElements.spinner.remove();

  if (isErr(response)) {
    displayInitError(response.reason);
    return;
  }

  if (response.reports.length === 0) {
    unhideElement(uiElements.noDeliveriesMessage);
    return;
  }

  displayReport(uiElements.tbody, response);
  unhideElement(uiElements.report);
}

function displayReport(tbody: HTMLTableSectionElement, response: DeliveryReportResponse) {
  response.reports.forEach((report) => tbody.append(makeTrForReport(report)));
}

function makeTrForReport(report: DeliveryReportData): HTMLTableRowElement {
  const tr = createElement('tr');

  tr.append(
    createDeliveryStartCell(report.deliveryStart),
    createPostTitleCell(report.postTitle, report.postURL),
    createSentCountCell(report.messageCounts.sent),
    createFailedCountCell(report.messageCounts)
  );

  return tr;
}

function createSentCountCell(count: number): HTMLTableCellElement {
  return createElement('td', count.toString(), { class: 'text-end' });
}

function createFailedCountCell(messageCounts: MessageCounts): HTMLTableCellElement {
  const failed = messageCounts['mailbox-full'] + messageCounts.bounced;

  return createElement('td', failed.toString(), { class: 'text-end' });
}

function createDeliveryStartCell(dateString: string): HTMLTableCellElement {
  return createElement('td', formatDeliveryStart(dateString));
}

export function formatDeliveryStart(dateString: string): string {
  const date = new Date(dateString);

  const monthName = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes().toString().padStart(2, '0');

  return si`${monthName} ${day}, ${hour}:${minute}`;
}

function createPostTitleCell(title: string, urlString: string): HTMLTableCellElement {
  const td = createElement('td');
  const postTitleLink = createElement('a', title, {
    href: urlString,
    target: '_blank',
  });

  td.append(postTitleLink);

  return td;
}

async function loadReports<T = DeliveryReportResponse>(feedId: FeedId): Promise<Result<T>> {
  const request: DeliveryReportsRequestData = { feedId: feedId.value };
  const response = await asyncAttempt(() => sendApiRequest<T>(ApiPath.deliveryReports, HttpMethod.GET, request));

  if (isErr(response)) {
    return makeErr('Failed to load the report');
  }

  if (isAppError(response)) {
    return makeErr(response.message);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the report');
  }

  return response.responseData!;
}

interface RequiredParams {
  id: string;
  displayName: string;
}

interface RequiredUiElements extends SpinnerUiElements, BreadcrumbsUiElements {
  noDeliveriesMessage: HTMLElement;
  report: HTMLElement;
  tbody: HTMLTableSectionElement;
  upgdrageLink: HTMLAnchorElement;
}

main();
