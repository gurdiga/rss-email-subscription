import { si } from '../shared/string-utils';

function main() {
  const x = getCookieByName('displayPrivateNavbar');
  const test = getCookieByName('test');

  console.log('Hello navbar', { x, test });
}

export function getCookieByName(name: string, documentCookie = document.cookie): string {
  const pairs = documentCookie.split(/; /g) || [];
  const pair = pairs.find((x) => x.startsWith(si`${name}=`));

  if (!pair) {
    return '';
  }

  const value = pair.split('=')[1] || '';

  return decodeURIComponent(value);
}

globalThis.window && main();
