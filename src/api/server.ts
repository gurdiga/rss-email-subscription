import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { subscribe } from './subscription';
import { confirmSubscription } from './subscription-confirmation';
import { oneClickUnsubscribe, unsubscribe } from './unsubscription';
import { createAccount } from './create-account';
import { makeRequestHandler } from './request-handler';
import { initApp } from './init-app';
import { makeCustomLoggers } from '../shared/logging';

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
  server.use(helmet());
  server.use(cors());
  server.use(express.urlencoded({ extended: true }));
  server.post('/subscribe', makeRequestHandler(subscribe, app));
  server.post('/confirm-subscription', makeRequestHandler(confirmSubscription, app));
  server.post('/unsubscribe', makeRequestHandler(unsubscribe, app));
  server.post('/unsubscribe/:id', makeRequestHandler(oneClickUnsubscribe, app));
  server.post('/create-account', makeRequestHandler(createAccount, app));

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
