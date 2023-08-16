import { ApiPath } from '../domain/api-path';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { querySelector } from './dom-isolation';
import {
  displayInitError,
  hideElement,
  HttpMethod,
  isAuthenticated,
  isDemoAccount,
  onClick,
  requireUiElements,
  sendApiRequest,
  toggleElement,
  unhideElement,
} from './shared';

function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    publicNav: '#right-navbar-nav-public',
    privateNav: '#right-navbar-nav-private',
    signOutLink: '#sign-out-link',
    haSignInLink: '#ha-sign-in',
    navToggle: 'button[data-bs-toggle="collapse"]',
    demoWarningMessage: '#demo-warning-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  if (isAuthenticated()) {
    displayPrivateNavbar(uiElements);
  } else {
    displayPublicNavbar(uiElements);
  }

  toggleElement(isDemoAccount(), uiElements.demoWarningMessage);
  maybeInitMobileToggle(uiElements.navToggle);
}

function maybeInitMobileToggle(button: HTMLButtonElement): void {
  const isMobile = button.clientHeight > 0;

  if (!isMobile) {
    // NOTE: This is not bullet-proof, but should work in most relevant
    // cases.
    return;
  }

  const menuSelector = button.dataset['bsTarget'];

  if (!menuSelector) {
    displayInitError('Menu toggle has an empty menu selector');
    return;
  }

  const menu = querySelector(menuSelector) as HTMLElement;

  if (!menu) {
    displayInitError(si`Menu not found by selector: "${menuSelector}"`);
    return;
  }

  menu.classList.remove('collapse');

  const menuActualHeight = menu.clientHeight;

  menu.style.height = '0';
  menu.style.overflow = 'hidden';
  menu.style.transition = 'height 0.3s ease-in-out';

  let isHidden = true;

  onClick(button, () => {
    isHidden = !isHidden;
    menu.style.height = isHidden ? '0' : menuActualHeight + 'px';
  });
}

function displayPublicNavbar(uiElements: RequiredUiElements): void {
  const { privateNav, publicNav, haSignInLink } = uiElements;

  unhideElement(publicNav);
  unhideElement(haSignInLink);
  hideElement(privateNav);
}

function displayPrivateNavbar(uiElements: RequiredUiElements): void {
  const { privateNav, publicNav, signOutLink } = uiElements;

  unhideElement(privateNav);
  hideElement(publicNav);

  onClick(signOutLink, async (e: Event) => {
    e.preventDefault();

    const response = await asyncAttempt(() => sendApiRequest(ApiPath.deauthentication, HttpMethod.POST));

    if (isErr(response)) {
      signOutLink.textContent = 'Failed!';
      signOutLink.classList.add('text-danger');
      return;
    }

    location.href = signOutLink.href;
  });
}

interface RequiredUiElements {
  publicNav: HTMLElement;
  privateNav: HTMLElement;
  signOutLink: HTMLAnchorElement;
  haSignInLink: HTMLAnchorElement;
  navToggle: HTMLButtonElement;
  demoWarningMessage: HTMLElement;
}

typeof window !== 'undefined' && main();
