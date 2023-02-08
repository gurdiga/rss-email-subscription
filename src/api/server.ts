import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { subscription } from './subscription';
import { subscriptionConfirmation } from './subscription-confirmation';
import { unsubscription } from './unsubscription';
import { registration } from './registration';
import { makeRequestHandler } from './request-handler';
import { initApp } from './init-app';
import { makeCustomLoggers } from '../shared/logging';
import { authentication } from './authentication';
import { registrationConfirmation } from './registration-confirmation';
import { makeExpressSession } from './session';
import { sessionTest } from './session-test';
import { deauthentication } from './deauthentication';
import { createFeed, deleteFeed, listFeeds, loadFeedById, updateFeed } from './feeds';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { getErrorMessage } from '../shared/lang';

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
  router.get('/feeds', makeRequestHandler(listFeeds, app));
  router.get('/feeds/:feedId', makeRequestHandler(loadFeedById, app));
  router.post('/feeds', makeRequestHandler(createFeed, app));
  router.put('/feeds', makeRequestHandler(updateFeed, app));
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
