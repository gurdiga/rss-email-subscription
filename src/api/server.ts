import express, { RequestHandler } from 'express';
import helmet from 'helmet';
import { makeCustomLoggers } from '../shared/logging';
import { AppError, InputError, isAppError, isInputError, isSuccess, Success } from './shared';
import { subscribe } from './subscription';
import { unsubscribe } from './unsubscription';

let requestCounter = 0;

function main() {
  const { logInfo, logError } = makeCustomLoggers({ module: 'API' });
  const dataDirRoot = process.env.DATA_DIR_ROOT;

  if (!dataDirRoot) {
    logError(`DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  const port = 3000;
  const app = express();

  app.use(helmet());
  app.use(express.urlencoded({ extended: true }));
  app.post('/subscribe', makeRequestHandler('Subscription', dataDirRoot, subscribe));
  app.post('/unsubscribe', makeRequestHandler('Subscription', dataDirRoot, unsubscribe));

  app.listen(port, () => {
    logInfo(`Running on http://0.0.0.0:${port}`, { dataDirRoot });
  });
}

function makeRequestHandler(
  action: string,
  dataDirRoot: string,
  handle: (reqBody: object, dataDirRoot: string) => Success | InputError | AppError
): RequestHandler {
  return (req, res) => {
    const { logInfo, logError, logWarning } = makeCustomLoggers({ reqId: ++requestCounter });
    const reqBody = req.body || {};

    logInfo(action, { reqBody, dataDirRoot });

    const result = handle(reqBody, dataDirRoot);

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
