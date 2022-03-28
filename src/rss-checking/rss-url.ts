import { makeErr, Result } from '../web-ui/shared/lang';

export function makeUrl(urlString?: string): Result<URL> {
  if (!urlString) {
    return makeErr('Missing URL string');
  }

  try {
    const url = new URL(urlString);

    if (url.protocol === 'https:') {
      return url;
    } else {
      return makeErr(`Invalid protocol: "${url.protocol}"`);
    }
  } catch (error) {
    /**
      error is something like this:

      Uncaught TypeError [ERR_INVALID_URL]: Invalid URL
        at __node_internal_captureLargerStackTrace (node:internal/errors:464:5)
        at new NodeError (node:internal/errors:371:5)
        at onParseError (node:internal/url:536:9)
        at new URL (node:internal/url:612:5) {
      input: 'url',
      code: 'ERR_INVALID_URL'
    }
    */

    const errorCode = error && (error as any).code; // `TypeError` interface type does not include the `code`?!
    const errorDetail = errorCode || '[NO ERROR CODE]';

    return makeErr(`${errorDetail}: ${urlString}`);
  }
}
