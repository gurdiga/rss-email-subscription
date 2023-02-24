import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getErrorMessage } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
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

  const port = 3000;
  const server = express();
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
  router.get('/feeds', makeRequestHandler(loadFeeds, app));
  router.get('/feeds/:feedId', makeRequestHandler(loadFeedById, app));
  router.get('/feeds/:feedId/subscribers', makeRequestHandler(loadFeedSubscribers, app));
  router.post('/feeds/:feedId/delete-subscribers', makeRequestHandler(deleteFeedSubscribers, app));
  router.post('/feeds/:feedId/add-subscribers', makeRequestHandler(addFeedSubscribers, app));
  router.post('/feeds/add-new-feed', makeRequestHandler(addNewFeed, app));
  router.post('/feeds/edit-feed', makeRequestHandler(editFeed, app));
  router.delete('/feeds/:feedId', makeRequestHandler(deleteFeed, app));

  if (process.env['NODE_ENV'] === 'development') {
    server.use('/api', router);
    server.use('/', express.static(process.env['DOCUMENT_ROOT']!));
  } else {
    server.use(router);
  }

  const shutdownHandle = server.listen(port, () => {
    logInfo(si`Starting API server in ${process.env['NODE_ENV']!} environment`);
    logInfo(si`Listening on http://0.0.0.0:${port.toString()}`);
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
