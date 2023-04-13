import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('line', (line) => {
  console.log('received report: ', line);
});

// NOTE: Delivery storage key = QID + timestamp to be able to record multiple delivery attempts.
