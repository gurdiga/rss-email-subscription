import express from 'express';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { unsubscribe } from './unsubscription';

const app = express();

const dataDirRoot = process.env.DATA_DIR_ROOT;

if (!dataDirRoot) {
  logError(`DATA_DIR_ROOT envar missing`);
  process.exit(1);
}

app.disable('x-powered-by');
app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/unsubscribe', (req, res) => {
  const { query } = req;

  logInfo('Unsubscription request', { query, dataDirRoot });

  const { id } = query;
  const result = unsubscribe(id, dataDirRoot);

  if (isErr(result)) {
    logError('Unsubscription request failed', { query, reason: result.reason });
    res.sendStatus(500);
    return;
  }

  if (result.kind === 'NotFound') {
    logInfo('Not found', { id });
    res.sendStatus(404);
    return;
  }

  logInfo('Unsubscription request succeded', { query });

  res.sendStatus(200);
});

const port = 3000;
const host = 'localhost';

app.listen(port, host, () => {
  logInfo(`Running on http://${host}:${port}`, { dataDirRoot });
});
