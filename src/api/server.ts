import express, { RequestHandler } from 'express';
import helmet from 'helmet';
import { isErr } from '../shared/lang';
import { logWarning, makeCustomLoggers } from '../shared/logging';
import { isAppError, isInputError, isSuccess } from './shared';
import { subscribe } from './subscription';
import { unsubscribe } from './unsubscription';

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
  app.post('/subscribe', makeSubscriptionController(dataDirRoot));
  app.post('/unsubscribe', makeUnsubscriptionController(dataDirRoot));

  app.listen(port, () => {
    logInfo(`Running on http://0.0.0.0:${port}`, { dataDirRoot });
  });
}

function makeSubscriptionController(dataDirRoot: string): RequestHandler {
  // TODO: CSRF?
  const { logInfo, logError } = makeCustomLoggers({ module: 'SubscriptionController' });

  return (req, res) => {
    const { body } = req;

    logInfo('Subscription request', { body, dataDirRoot });

    const { feedId, email } = body;
    const result = subscribe(feedId, email, dataDirRoot);

    // TODO: Some manual testing: make api + curl ...

    if (isSuccess(result)) {
      logInfo('Subscription request succeded', { feedId, email });
      res.sendStatus(200);
      return;
    }

    if (isInputError(result)) {
      logWarning('Subscription request input error', { body, message: result.message });
      res.status(400).send(result);
    }

    if (isAppError(result)) {
      logError('Subscription request failed', { body, message: result.message });
      res.sendStatus(500);
      return;
    }
  };
}

function makeUnsubscriptionController(dataDirRoot: string): RequestHandler {
  const { logInfo, logError } = makeCustomLoggers({ module: 'UnsubscriptionHandler' });

  return (req, res) => {
    const { body } = req;

    logInfo('Unsubscription request', { body, dataDirRoot });

    const { id } = body;
    const result = unsubscribe(id, dataDirRoot);

    // TODO: Align code structure with makeSubscriptionController

    if (isErr(result)) {
      logError('Unsubscription request failed', { body, reason: result.reason });
      res.sendStatus(500);
      return;
    }

    if (result.kind === 'NotFound') {
      logInfo('Not found', { id });
      res.sendStatus(404);
      return;
    }

    logInfo('Unsubscription request succeded', { id });

    res.sendStatus(200);
  };
}

main();
