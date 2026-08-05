import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { readFileSync } from 'fs';
import helmet from 'helmet';
import http from 'http';
import https from 'https';
import { apiBasePath, ApiPath } from '../domain/api-path';
import { startCronJob } from '../shared/cron-utils';
import { getErrorMessage } from '../shared/lang';
import { logHeartbeat, makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import {
  confirmAccountEmailChange,
  deleteAccountWithPassword,
  loadCurrentAccount,
  requestAccountEmailChange,
  requestAccountPasswordChange,
  requestAccountPlanChange,
  requestPaymentMethodUpdate,
} from './account';
import { makeAppRequestHandler, requirePaymentConfirmed } from './app-request-handler';
import { authentication } from './authentication';
import { deauthentication } from './deauthentication';
import { deliveryReports } from './delivery-reports';
import {
  addFeedSubscribers,
  checkFeedUrl,
  deleteFeedSubscribers,
  loadFeedById,
  loadFeedDisplayName,
  loadFeedSubscribers,
} from './feeds';
import { addNewFeed } from './feeds/add-new-feed';
import { deleteFeed } from './feeds/delete-feed';
import { editFeed } from './feeds/edit-feed';
import { loadFeeds } from './feeds/load-feeds';
import { manageFeed } from './feeds/manage-feed';
import { showSampleEmail, showSampleEmailPublic } from './feeds/show-sample-email';
import { initApp } from './init-app';
import { confirmPasswordReset, requestPasswordReset } from './password-reset';
import { hour, isRateLimitingDisabled, makeRateLimiter, minute } from './rate-limiting';
import { registration, registrationConfirmation } from './registration';
import { makeExpressSession } from './session';
import { sessionTest } from './session-test';
import {
  accountSupportProduct,
  paddleData,
  paddleKeys,
  paddleWebhookHandler,
  storeCardDescription,
} from './payment-integration';
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
  router.use(cookieParser());
  router.get(ApiPath.corsTest, (_req, res) => {
    res.send('CORS test');
  });
  router.use(express.urlencoded({ extended: true }));
  router.use(makeExpressSession(app));
  router.get(ApiPath.sessionTest, makeAppRequestHandler(sessionTest, app));
  router.post(ApiPath.subscription, makeAppRequestHandler(subscription, app));
  router.post(ApiPath.subscriptionConfirmation, makeAppRequestHandler(subscriptionConfirmation, app));
  router.post(ApiPath.unsubscription, makeAppRequestHandler(unsubscription, app));
  // The unauthenticated endpoints are rate-limited per client IP: the password
  // paths each cost ~135ms of scrypt on a one-vCPU box, and request-password-reset
  // sends mail to a third party. See rate-limiting.ts for how the client IP is
  // resolved and why the in-memory store assumes a single api process.
  router.post(ApiPath.registration, makeRateLimiter(5, hour), makeAppRequestHandler(registration, app));
  router.post(
    ApiPath.registrationConfirmation,
    makeRateLimiter(20, 15 * minute),
    makeAppRequestHandler(registrationConfirmation, app)
  );
  router.post(ApiPath.authentication, makeRateLimiter(20, 15 * minute), makeAppRequestHandler(authentication, app));
  router.post(ApiPath.requestPasswordReset, makeRateLimiter(5, hour), makeAppRequestHandler(requestPasswordReset, app));
  router.post(
    ApiPath.confirmPasswordReset,
    makeRateLimiter(20, 15 * minute),
    makeAppRequestHandler(confirmPasswordReset, app)
  );
  router.post(ApiPath.deauthentication, makeAppRequestHandler(deauthentication, app));
  router.get(ApiPath.loadCurrentAccount, makeAppRequestHandler(loadCurrentAccount, app));
  router.post(ApiPath.requestAccountEmailChange, makeAppRequestHandler(requestAccountEmailChange, app));
  router.post(ApiPath.confirmAccountEmailChange, makeAppRequestHandler(confirmAccountEmailChange, app));
  // Limited despite requiring a session: both verify a password, so both spend a
  // scrypt hash before anything else gates them, and a session costs an attacker
  // one self-confirmed registration.
  router.post(
    ApiPath.requestAccountPasswordChange,
    makeRateLimiter(10, 15 * minute),
    makeAppRequestHandler(requestAccountPasswordChange, app)
  );
  router.post(ApiPath.requestAccountPlanChange, makeAppRequestHandler(requestAccountPlanChange, app));
  router.post(ApiPath.requestPaymentMethodUpdate, makeAppRequestHandler(requestPaymentMethodUpdate, app));
  router.post(
    ApiPath.deleteAccountWithPassword,
    makeRateLimiter(5, 15 * minute),
    makeAppRequestHandler(deleteAccountWithPassword, app)
  );
  router.get(ApiPath.loadFeeds, makeAppRequestHandler(loadFeeds, app));
  router.get(ApiPath.loadFeedById, makeAppRequestHandler(loadFeedById, app));
  router.get(ApiPath.loadFeedDisplayName, makeAppRequestHandler(loadFeedDisplayName, app));
  router.get(ApiPath.manageFeed, makeAppRequestHandler(manageFeed, app));
  router.get(ApiPath.loadFeedSubscribers, makeAppRequestHandler(loadFeedSubscribers, app));
  router.get(ApiPath.deliveryReports, makeAppRequestHandler(deliveryReports, app));
  const paymentConfirmed = requirePaymentConfirmed(app);

  router.post(ApiPath.deleteFeedSubscribers, paymentConfirmed, makeAppRequestHandler(deleteFeedSubscribers, app));
  router.post(ApiPath.addFeedSubscribers, paymentConfirmed, makeAppRequestHandler(addFeedSubscribers, app));
  router.post(ApiPath.addNewFeed, paymentConfirmed, makeAppRequestHandler(addNewFeed, app));
  router.post(ApiPath.editFeed, paymentConfirmed, makeAppRequestHandler(editFeed, app));
  router.post(ApiPath.deleteFeed, paymentConfirmed, makeAppRequestHandler(deleteFeed, app));
  router.post(ApiPath.showSampleEmail, makeAppRequestHandler(showSampleEmail, app));
  router.post(ApiPath.showSampleEmailPublic, makeAppRequestHandler(showSampleEmailPublic, app));
  router.post(ApiPath.checkFeedUrl, makeAppRequestHandler(checkFeedUrl, app));
  router.get(ApiPath.paymentKeys, makeAppRequestHandler(paddleKeys, app));
  router.post(ApiPath.storeCardDescription, makeAppRequestHandler(storeCardDescription, app));
  router.get(ApiPath.accountSupportProduct, makeAppRequestHandler(accountSupportProduct, app));
  router.get(ApiPath.paymentData, makeAppRequestHandler(paddleData, app));
  router.post(
    ApiPath.paymentWebhook,
    express.raw({ type: '*/*' }), // raw body required for Paddle signature verification
    paddleWebhookHandler(app)
  );

  const isDev = process.env['NODE_ENV'] === 'development';

  if (isDev) {
    expressServer.use(apiBasePath, router);
    expressServer.use('/', express.static(process.env['DOCUMENT_ROOT']!));
    expressServer.get('/to/:feedId', (req, res) =>
      res.redirect(si`/subscription-request.html?feedId=${req.params['feedId']}`)
    );
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
    const envName = process.env['NODE_ENV'] || 'MISSING_NODE_ENV';

    logInfo(si`Starting API server in ${envName} environment as PID ${process.pid}`);
    logInfo(si`Listening on ${scheme}://${app.env.DOMAIN_NAME}:${port}`);
    logInfo(si`Rate limiting is ${isRateLimitingDisabled() ? 'DISABLED' : 'enabled'}`);
  });

  const heartBeat = startCronJob('5 5 * * *', () => logHeartbeat(logInfo));

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will shut down the HTTP server and exit.');

    shutdownHandle.close((error?: Error) => {
      if (error) {
        logWarning(si`Failed to shutdown HTTP server: ${getErrorMessage(error)}`);
      }
    });

    heartBeat.stop();
  });

  process.on('SIGHUP', () => {
    logHeartbeat(logInfo);
  });
}

main();
