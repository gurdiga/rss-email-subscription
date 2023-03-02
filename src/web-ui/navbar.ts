import { navbarCookieName } from '../api/app-cookie';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { displayInitError, hideElement, HttpMethod, requireUiElements, sendApiRequest, unhideElement } from './shared';

function main() {
  const navbarCookie = getCookieByName(navbarCookieName);

  const uiElements = requireUiElements<RequiredUiElements>({
    publicNav: '#right-navbar-nav-public',
    privateNav: '#right-navbar-nav-private',
    signOutLink: '#sign-out-link',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  if (navbarCookie === 'true') {
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

export function getCookieByName(name: string, documentCookie = document.cookie): string {
  const pairs = documentCookie.split('; ');
  const pair = pairs.find((x) => x.startsWith(si`${name}=`)) || '';

  const encodedValue = pair.split('=')[1] || '';
  const value = decodeURIComponent(encodedValue);

  return value;
}

interface RequiredUiElements {
  publicNav: HTMLElement;
  privateNav: HTMLElement;
  signOutLink: HTMLAnchorElement;
}

globalThis.window && main();
