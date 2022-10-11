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

async function main() {
  const { logInfo, logWarning } = makeCustomLoggers({ module: 'server' });

  const port = 3000;
  const server = express();
  const app = initApp();

  server.use(
    '/web-ui-scripts',
    helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
    express.static(`${__dirname}/web-ui-scripts`)
  );
  server.use('/api-version.txt', express.static(`${__dirname}/api-version.txt`));
  server.use(helmet());
  server.use(cors());
  server.use(express.urlencoded({ extended: true }));
  server.post('/subscription', makeRequestHandler(subscription, app));
  server.post('/subscription-confirmation', makeRequestHandler(subscriptionConfirmation, app));
  server.post('/unsubscription', makeRequestHandler(unsubscription, app));
  server.post('/registration', makeRequestHandler(registration, app));
  server.post('/registration-confirmation', makeRequestHandler(registrationConfirmation, app));
  server.post('/authentication', makeRequestHandler(authentication, app));

  if (process.env['NODE_ENV'] === 'development' && process.env['DOCUMENT_ROOT']) {
    server.use('/', express.static(process.env['DOCUMENT_ROOT']));
  }

  server.listen(port, () => {
    logInfo(`Listening on http://0.0.0.0:${port}`);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will shut down.');
  });
}

main();
