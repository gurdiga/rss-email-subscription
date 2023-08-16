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
import { createElement } from './dom-isolation';
import {
  displayInitError,
  isDemoAccount,
  onClick,
  reportAppError,
  requireQueryParams,
  requireUiElements,
  toggleElement,
} from './shared';

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
    linkContainer: '#link-container',
    demoAccountNote: '#demo-account-note',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const { scriptContainer, linkContainer } = uiElements;

  scriptContainer.value =
    si`<script res-subscription-form data-feed-id="${feedId.value}"` +
    si` src="${location.origin}/web-ui-scripts/web-ui/subscription-form.js">` +
    si`</script>`;

  linkContainer.value = si`${location.origin}/to/${feedId.value}`;

  addCopyButton(scriptContainer, linkContainer);

  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(queryStringParams.displayName, feedId),
    {
      label: uiElements.pageTitle.textContent!,
    },
  ]);

  toggleElement(isDemoAccount(), uiElements.demoAccountNote);
}

function addCopyButton(...elements: HTMLTextAreaElement[]): void {
  elements.forEach((el) => {
    const parentStyle = getComputedStyle(el.parentElement!);
    const parentIsPositioned = ['relative', 'absolute', 'fixed'].includes(parentStyle.position);

    if (!parentIsPositioned) {
      reportAppError(new Error(si`${addCopyButton.name} failed because of non-positioned element parent`));
      return;
    }

    el.after(createCopyButton(el));
  });
}

function createCopyButton(el: HTMLTextAreaElement): HTMLElement {
  const buttonLabel = 'Copy';
  const button = createElement('button', buttonLabel, {
    class: 'btn btn-primary btn-sm',
  });

  setStyle(button, {
    position: 'absolute',
    right: '.25rem',
    transform: 'translateY(-110%)',
    '--bs-btn-padding-y': '.25rem',
    '--bs-btn-padding-x': '.5rem',
    '--bs-btn-font-size': '.75rem',
  });

  onClick(button, () => {
    el.select();
    document.execCommand('copy');
    button.textContent = 'Copied!';
    el.selectionEnd = 0;

    setTimeout(() => {
      button.textContent = buttonLabel;
    }, 1000);
  });

  return button;
}

function setStyle(el: HTMLElement, style: Record<string, string>): void {
  for (const [prop, value] of Object.entries(style)) {
    el.style.setProperty(prop, value);
  }
}

interface RequiredUiElements extends BreadcrumbsUiElements {
  scriptContainer: HTMLTextAreaElement;
  linkContainer: HTMLTextAreaElement;
  demoAccountNote: HTMLElement;
}

main();
