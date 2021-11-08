import express, { RequestHandler } from 'express';
import helmet from 'helmet';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, isAppError, isInputError, isSuccess } from './shared';
import { subscribe } from './subscription';
import { unsubscribe } from './unsubscription';

let requestCounter = 0;

function main() {
  const port = 3000;
  const app = express();

  app.use(helmet());
  app.use(express.urlencoded({ extended: true }));
  app.post('/subscribe', makeRequestHandler('Subscription', subscribe));
  app.post('/unsubscribe', makeRequestHandler('Subscription', unsubscribe));

  app.listen(port, () => {
    console.log(`Running on http://0.0.0.0:${port}`);
  });
}

function makeRequestHandler(action: string, handler: AppRequestHandler): RequestHandler {
  const dataDirRoot = process.env.DATA_DIR_ROOT;

  if (!dataDirRoot) {
    console.error(`DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  return (req, res) => {
    const { logInfo, logError, logWarning } = makeCustomLoggers({ reqId: ++requestCounter });
    const reqBody = req.body || {};

    logInfo(action, { reqBody, dataDirRoot });

    const result = handler(reqBody, dataDirRoot);

    if (isSuccess(result)) {
      logInfo(`${action} succeded`, result.logData);
      res.sendStatus(200);
      return;
    }

    if (isInputError(result)) {
      logWarning(`${action} input error`, { message: result.message });
      res.status(400).send(result);
    }

    if (isAppError(result)) {
      logError(`${action} failed`, { message: result.message });
      res.sendStatus(500);
      return;
    }
  };
}

main();
