import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/unsubscribe', (req, res) => {
  // TODO
  res.send(`Unsubscribing ${JSON.stringify(req.params)}`);
});

const port = 3000;
const host = 'localhost';

app.listen(port, host, () => {
  console.log(`Running on http://${host}:${port}`);
});
