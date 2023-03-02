import { asyncAttempt, isErr } from '../shared/lang';
import {
  displayInitError,
  hideElement,
  HttpMethod,
  isAuthenticated,
  requireUiElements,
  sendApiRequest,
  unhideElement,
} from './shared';

function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    publicNav: '#right-navbar-nav-public',
    privateNav: '#right-navbar-nav-private',
    signOutLink: '#sign-out-link',
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
  const { privateNav, publicNav, signOutLink } = uiElements;

  unhideElement(privateNav);
  hideElement(publicNav);

  signOutLink.addEventListener('click', async (e: Event) => {
    e.preventDefault();

    const response = await asyncAttempt(() => sendApiRequest('/deauthentication', HttpMethod.POST));

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
}

globalThis.window && main();
