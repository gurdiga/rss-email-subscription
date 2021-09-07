import express from 'express';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { unsubscribe } from './unsubscription';

const app = express();

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/unsubscribe', (req, res) => {
  logInfo('Unsubscription request', req.query);

  const result = unsubscribe(req.query.id);

  if (isErr(result)) {
    logError('Unsubscription request failed', { query: req.query, reason: result.reason });
    res.sendStatus(500);
    return;
  }

  if (result.kind === 'NotFound') {
    logError('Unsubscription request failed', { query: req.query, reason: 'not found' });
    res.sendStatus(404);
    return;
  }

  logInfo('Unsubscription request succeded', { query: req.query });
  res.sendStatus(200);
});

const port = 3000;
const host = 'localhost';

app.listen(port, host, () => {
  console.log(`Running on http://${host}:${port}`);
});
