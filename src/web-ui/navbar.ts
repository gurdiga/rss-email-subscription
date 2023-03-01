import { navbarCookieName } from '../api/app-cookie';
import { isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { displayInitError, hideElement, requireUiElements, unhideElement } from './shared';

interface RequiredUiElements {
  publicNav: HTMLElement;
  privateNav: HTMLElement;
}

function main() {
  const navbarCookie = getCookieByName(navbarCookieName);

  const uiElements = requireUiElements<RequiredUiElements>({
    publicNav: '#right-navbar-nav-public',
    privateNav: '#right-navbar-nav-private',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  if (navbarCookie === 'true') {
    unhideElement(uiElements.privateNav);
    hideElement(uiElements.publicNav);
  } else {
    unhideElement(uiElements.publicNav);
    hideElement(uiElements.privateNav);
  }
}

export function getCookieByName(name: string, documentCookie = document.cookie): string {
  const pairs = documentCookie.split('; ');
  const pair = pairs.find((x) => x.startsWith(si`${name}=`)) || '';

  const encodedValue = pair.split('=')[1] || '';
  const value = decodeURIComponent(encodedValue);

  return value;
}

globalThis.window && main();
