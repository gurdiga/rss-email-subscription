import { FeedId } from '../domain/feed-id';
import { makePagePathWithParams, PagePath } from '../domain/page-path';
import { createElement } from './dom-isolation';
import { hideElement } from './shared';

export interface BreadcrumbsUiElements {
  breadcrumbs: HTMLOListElement;
  mobileBreadcrumbs: HTMLAnchorElement;
  pageTitle: HTMLHeadingElement;
}

export const breadcrumbsUiElements: Record<keyof BreadcrumbsUiElements, string> = {
  breadcrumbs: '#breadcrumbs',
  mobileBreadcrumbs: '#mobile-breadcrumbs',
  pageTitle: 'h1',
};

type BreadcrumbsSegment = BreadcrumbsLink | BreadcrumbsLabel;

interface BreadcrumbsLink {
  label: string;
  href: string;
}

interface BreadcrumbsLabel {
  label: string;
}

export function displayBreadcrumbs(uiElements: BreadcrumbsUiElements, segments: BreadcrumbsSegment[]): void {
  displayDesktopBreadcrumbs(uiElements, segments);
  displayMobileBreadcrumbs(uiElements, segments);
}

function displayDesktopBreadcrumbs(uiElements: BreadcrumbsUiElements, segments: BreadcrumbsSegment[]): void {
  const segmentElements = segments.map(createBreadcrumbElement);

  uiElements.breadcrumbs.append(...segmentElements);
}

function displayMobileBreadcrumbs(uiElements: BreadcrumbsUiElements, segments: BreadcrumbsSegment[]): void {
  const previousPageLink = segments.slice(-2, -1)[0] as BreadcrumbsLink;

  if (previousPageLink) {
    uiElements.mobileBreadcrumbs.textContent = previousPageLink.label;
    uiElements.mobileBreadcrumbs.href = previousPageLink.href;
  } else {
    hideElement(uiElements.mobileBreadcrumbs);
  }
}

function createBreadcrumbElement(segment: BreadcrumbsSegment): HTMLLIElement {
  const li = createElement('li', '', { class: 'breadcrumb-item' }) as HTMLLIElement;

  if ('href' in segment) {
    li.appendChild(createElement('a', segment.label, { href: segment.href }));
  } else {
    li.textContent = segment.label;
    li.classList.add('active');
  }

  return li;
}

export const feedListBreadcrumbsLink: BreadcrumbsLink = {
  label: 'Blog feeds',
  href: PagePath.feedList,
};

export function makeFeedManageBreadcrumbsLink(displayName: string, feedId: FeedId): BreadcrumbsLink {
  const link: BreadcrumbsLink = {
    label: displayName,
    href: makePagePathWithParams(PagePath.feedManage, { id: feedId.value }),
  };

  return link;
}
