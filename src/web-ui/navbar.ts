import { ApiPath } from '../domain/api-path';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  displayInitError,
  hideElement,
  HttpMethod,
  isAuthenticated,
  onClick,
  requireUiElements,
  sendApiRequest,
  unhideElement,
} from './shared';

function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    publicNav: '#right-navbar-nav-public',
    privateNav: '#right-navbar-nav-private',
    signOutLink: '#sign-out-link',
    haSignInLink: '#ha-sign-in',
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
}

function displayPublicNavbar(uiElements: RequiredUiElements): void {
  unhideElement(uiElements.publicNav);
  hideElement(uiElements.privateNav);
}

function displayPrivateNavbar(uiElements: RequiredUiElements): void {
  const { privateNav, publicNav, signOutLink, haSignInLink } = uiElements;

  unhideElement(privateNav);
  hideElement(publicNav);
  hideElement(haSignInLink);

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
}

typeof window !== 'undefined' && main();
