import express, { RequestHandler } from 'express';
import helmet from 'helmet';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, isAppError, isInputError, isSuccess } from './shared';
import { subscribe } from './subscription';
import { confirmSubscription } from './subscription-confirmation';
import { oneClickUnsubscribe, unsubscribe } from './unsubscription';

let requestCounter = 0;

function main() {
  const port = 3000;
  const app = express();

  app.use(helmet());
  app.use(express.urlencoded({ extended: true }));
  app.post('/subscribe', makeRequestHandler(subscribe));
  app.post('/confirm-subscription', makeRequestHandler(confirmSubscription));
  app.post('/unsubscribe', makeRequestHandler(unsubscribe));
  app.post('/unsubscribe/:id', makeRequestHandler(oneClickUnsubscribe));

  app.listen(port, () => {
    console.log(`Listening on http://0.0.0.0:${port}`);
  });
}

function makeRequestHandler(handler: AppRequestHandler): RequestHandler {
  const dataDirRoot = process.env['DATA_DIR_ROOT'];

  if (!dataDirRoot) {
    console.error(`DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  return (req, res) => {
    const reqId = ++requestCounter;
    const { logInfo, logError, logWarning } = makeCustomLoggers({ reqId });

    const reqBody = req.body || {};
    const reqParams = req.params || {};
    const action = handler.name;

    logInfo(action, { reqId, action, reqBody, reqParams, dataDirRoot });

    const result = handler(reqId, reqBody, reqParams, dataDirRoot);

    if (isSuccess(result)) {
      logInfo(`${action} succeded`, result.logData);
      res.status(200).send(result);
    } else if (isInputError(result)) {
      logWarning(`${action} input error`, { message: result.message });
      res.status(400).send(result);
    } else if (isAppError(result)) {
      logError(`${action} failed`, { message: result.message });
      res.status(500).send(result);
    }
  };
}

main();
