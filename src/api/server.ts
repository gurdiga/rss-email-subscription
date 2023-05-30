import cors from 'cors';
import express from 'express';
import { readFileSync } from 'fs';
import helmet from 'helmet';
import http from 'http';
import https from 'https';
import { apiBasePath, ApiPath } from '../domain/api-path';
import { getErrorMessage } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import {
  confirmAccountEmailChange,
  deleteAccountWithPassword,
  loadCurrentAccount,
  requestAccountEmailChange,
  requestAccountPasswordChange,
  requestAccountPlanChange,
} from './account';
import { makeAppRequestHandler } from './app-request-handler';
import { authentication } from './authentication';
import { deauthentication } from './deauthentication';
import { deliveryReports } from './delivery-reports';
import {
  addFeedSubscribers,
  addNewFeed,
  checkFeedUrl,
  deleteFeed,
  deleteFeedSubscribers,
  editFeed,
  handleFeedManageScreen,
  loadFeedById,
  loadFeeds,
  loadFeedSubscribers,
} from './feeds';
import { initApp } from './init-app';
import { registration, registrationConfirmation } from './registration';
import { makeExpressSession } from './session';
import { sessionTest } from './session-test';
import { accountSupportProduct, stripeKeys } from './stripe-integration';
import { subscription } from './subscription';
import { subscriptionConfirmation } from './subscription-confirmation';
import { unsubscription } from './unsubscription';

async function main() {
  const { logInfo, logWarning } = makeCustomLoggers({ module: 'api-server' });

  const expressServer = express();
  const router = express.Router();
  const app = initApp();

  router.use(
    ApiPath.webUiScripts,
    helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
    express.static(makePath(__dirname, 'web-ui-scripts'))
  );
  router.use(ApiPath.versionTxt, express.static(makePath(__dirname, 'version.txt')));
  router.use(helmet());
  router.use(cors());
  router.get(ApiPath.corsTest, (_req, res) => res.send('CORS test'));
  router.use(express.urlencoded({ extended: true }));
  router.use(makeExpressSession(app));
  router.get(ApiPath.sessionTest, makeAppRequestHandler(sessionTest, app));
  router.post(ApiPath.subscription, makeAppRequestHandler(subscription, app));
  router.post(ApiPath.subscriptionConfirmation, makeAppRequestHandler(subscriptionConfirmation, app));
  router.post(ApiPath.unsubscription, makeAppRequestHandler(unsubscription, app));
  router.post(ApiPath.registration, makeAppRequestHandler(registration, app));
  router.post(ApiPath.registrationConfirmation, makeAppRequestHandler(registrationConfirmation, app));
  router.post(ApiPath.authentication, makeAppRequestHandler(authentication, app));
  router.post(ApiPath.deauthentication, makeAppRequestHandler(deauthentication, app));
  router.get(ApiPath.loadCurrentAccount, makeAppRequestHandler(loadCurrentAccount, app));
  router.post(ApiPath.requestAccountEmailChange, makeAppRequestHandler(requestAccountEmailChange, app));
  router.post(ApiPath.confirmAccountEmailChange, makeAppRequestHandler(confirmAccountEmailChange, app));
  router.post(ApiPath.requestAccountPasswordChange, makeAppRequestHandler(requestAccountPasswordChange, app));
  router.post(ApiPath.requestAccountPlanChange, makeAppRequestHandler(requestAccountPlanChange, app));
  router.post(ApiPath.deleteAccountWithPassword, makeAppRequestHandler(deleteAccountWithPassword, app));
  router.get(ApiPath.loadFeeds, makeAppRequestHandler(loadFeeds, app));
  router.get(ApiPath.loadFeedById, makeAppRequestHandler(loadFeedById, app));
  router.get(ApiPath.feedManageScreen, makeAppRequestHandler(handleFeedManageScreen, app));
  router.get(ApiPath.loadFeedSubscribers, makeAppRequestHandler(loadFeedSubscribers, app));
  router.get(ApiPath.deliveryReports, makeAppRequestHandler(deliveryReports, app));
  router.post(ApiPath.deleteFeedSubscribers, makeAppRequestHandler(deleteFeedSubscribers, app));
  router.post(ApiPath.addFeedSubscribers, makeAppRequestHandler(addFeedSubscribers, app));
  router.post(ApiPath.addNewFeed, makeAppRequestHandler(addNewFeed, app));
  router.post(ApiPath.editFeed, makeAppRequestHandler(editFeed, app));
  router.post(ApiPath.deleteFeed, makeAppRequestHandler(deleteFeed, app));
  router.post(ApiPath.checkFeedUrl, makeAppRequestHandler(checkFeedUrl, app));
  router.get(ApiPath.stripeKeys, makeAppRequestHandler(stripeKeys, app));
  router.get(ApiPath.accountSupportProduct, makeAppRequestHandler(accountSupportProduct, app));

  const isDev = process.env['NODE_ENV'] === 'development';

  if (isDev) {
    expressServer.use(apiBasePath, router);
    expressServer.use('/', express.static(process.env['DOCUMENT_ROOT']!));
  } else {
    expressServer.use(router);
  }

  const [port, scheme, server] = isDev
    ? [
        443,
        'https',
        https.createServer(
          {
            key: readFileSync('.tmp/certbot/conf/live/feedsubscription.com/privkey.pem'),
            cert: readFileSync('.tmp/certbot/conf/live/feedsubscription.com/cert.pem'),
          },
          expressServer
        ),
      ]
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
