import { navbarCookieName } from '../api/app-cookie';
import { si } from '../shared/string-utils';

function main() {
  const x = getCookieByName(navbarCookieName);
  const test = getCookieByName('test');

  console.log('Hello navbar', { x, test });
}

export function getCookieByName(name: string, documentCookie = document.cookie): string {
  const pairs = documentCookie.split('; ');
  const pair = pairs.find((x) => x.startsWith(si`${name}=`));

  if (!pair) {
    return '';
  }

  const encodedValue = pair.split('=')[1] || '';
  const value = decodeURIComponent(encodedValue);

  return value;
}

globalThis.window && main();
