import { App } from './init-app';

const session = require('express-session');
const FileStore = require('session-file-store')(session);

export function makeExpressSession({ env, settings }: App): ReturnType<typeof session> {
  const store = new FileStore({
    path: `${env.DATA_DIR_ROOT}/sessions`,
  });

  return session({
    store,
    secret: settings.hashingSalt,
    resave: false,
    saveUninitialized: true,
  });
}
