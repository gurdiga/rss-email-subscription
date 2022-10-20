// TODO: This should not exist. Ideally I should run it with Docket in dev too.

import express from 'express';
import { RequestHandler } from 'express';

export function devExtesions(): RequestHandler[] {
  if (process.env['NODE_ENV'] === 'development') {
    return [removeCSP, express.static(process.env['DOCUMENT_ROOT']!)];
  } else {
    const noop: RequestHandler = (_req, _res, next) => next();

    return [noop];
  }
}

const removeCSP: RequestHandler = (_req, res, next) => {
  // NOTE: This is needed in dev because some middleware (???) sets CSP
  // header and messes up with the value defined in the <meta> tags of
  // the website.
  res.removeHeader('Content-Security-Policy');
  next();
};
