import express from 'express';
import helmet from 'helmet';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { unsubscribe } from './unsubscription';

const app = express();

const dataDirRoot = process.env.DATA_DIR_ROOT;

if (!dataDirRoot) {
  logError(`DATA_DIR_ROOT envar missing`);
  process.exit(1);
}

app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.send('Hello World');
});

app.post('/unsubscribe', (req, res) => {
  const { body } = req;

  logInfo('Unsubscription request', { body, dataDirRoot });

  const { id } = body;
  const result = unsubscribe(id, dataDirRoot);

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

  logInfo('Unsubscription request succeded', { body });

  res.sendStatus(200);
});

const port = 3000;

app.listen(port, () => {
  logInfo(`Running on http://0.0.0.0:${port}`, { dataDirRoot });
});
