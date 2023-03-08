import cors from 'cors';
import express from 'express';
import { readFileSync } from 'fs';
import helmet from 'helmet';
import http from 'http';
import https from 'https';
import { getErrorMessage } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { changeAccountEmail, loadCurrentAccount } from './account';
import { authentication } from './authentication';
import { deauthentication } from './deauthentication';
import {
  addFeedSubscribers,
  addNewFeed,
  deleteFeed,
  deleteFeedSubscribers,
  editFeed,
  loadFeedById,
  loadFeeds,
  loadFeedSubscribers,
} from './feeds';
import { initApp } from './init-app';
import { registration } from './registration';
import { registrationConfirmation } from './registration-confirmation';
import { makeRequestHandler } from './request-handler';
import { makeExpressSession } from './session';
import { sessionTest } from './session-test';
import { subscription } from './subscription';
import { subscriptionConfirmation } from './subscription-confirmation';
import { unsubscription } from './unsubscription';

async function main() {
  const { logInfo, logWarning } = makeCustomLoggers({ module: 'api-server' });

  const expressServer = express();
  const router = express.Router();
  const app = initApp();

  router.use(
    '/web-ui-scripts',
    helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
    express.static(makePath(__dirname, 'web-ui-scripts'))
  );
  router.use('/version.txt', express.static(makePath(__dirname, 'version.txt')));
  router.use(helmet());
  router.use(cors());
  router.get('/cors-test', (_req, res) => res.send('CORS test'));
  router.use(express.urlencoded({ extended: true }));
  router.use(makeExpressSession(app));
  router.get('/session-test', makeRequestHandler(sessionTest, app));
  router.post('/subscription', makeRequestHandler(subscription, app));
  router.post('/subscription-confirmation', makeRequestHandler(subscriptionConfirmation, app));
  router.post('/unsubscription', makeRequestHandler(unsubscription, app));
  router.post('/registration', makeRequestHandler(registration, app));
  router.post('/registration-confirmation', makeRequestHandler(registrationConfirmation, app));
  router.post('/authentication', makeRequestHandler(authentication, app));
  router.post('/deauthentication', makeRequestHandler(deauthentication, app));
  router.get('/account', makeRequestHandler(loadCurrentAccount, app));
  router.post('/account/change-email', makeRequestHandler(changeAccountEmail, app));
  router.get('/feeds', makeRequestHandler(loadFeeds, app));
  router.get('/feeds/:feedId', makeRequestHandler(loadFeedById, app));
  router.get('/feeds/:feedId/subscribers', makeRequestHandler(loadFeedSubscribers, app));
  router.post('/feeds/:feedId/delete-subscribers', makeRequestHandler(deleteFeedSubscribers, app));
  router.post('/feeds/:feedId/add-subscribers', makeRequestHandler(addFeedSubscribers, app));
  router.post('/feeds/add-new-feed', makeRequestHandler(addNewFeed, app));
  router.post('/feeds/edit-feed', makeRequestHandler(editFeed, app));
  router.post('/feeds/delete-feed', makeRequestHandler(deleteFeed, app));

  const isDev = process.env['NODE_ENV'] === 'development';

  if (isDev) {
    expressServer.use('/api', router);
    expressServer.use('/', express.static(process.env['DOCUMENT_ROOT']!));
  } else {
    expressServer.use(router);
  }

  const devSsslKeys = {
    key: readFileSync('.tmp/certbot/conf/live/feedsubscription.com/privkey.pem'),
    cert: readFileSync('.tmp/certbot/conf/live/feedsubscription.com/cert.pem'),
  };

  const [port, scheme, server] = isDev
    ? [443, 'https', https.createServer(devSsslKeys, expressServer)]
    : [3000, 'http', http.createServer(expressServer)];

  const shutdownHandle = server.listen(port, () => {
    logInfo(si`Starting API server in ${process.env['NODE_ENV']!} environment`);
    logInfo(si`Listening on ${scheme}://${app.env.DOMAIN_NAME}:${port}`);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will shut down the HTTP server and exit.');

    shutdownHandle.close((error?: Error) => {
      if (error) {
        logWarning(si`Failed to shutdown HTTP server: ${getErrorMessage(error)}`);
      }
    });
  });
}

main();
