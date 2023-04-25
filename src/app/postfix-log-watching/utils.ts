let acc = '';

export function processData(data: Buffer): void {
  const { wholeLines, rest } = extractLines(acc + data.toString());

  acc = rest;
  wholeLines.forEach(processLine);
}

export function processLine(line: string): void {
  if (line === 'yes') {
    console.log('Got confirmation');
  }
}

interface Extraction {
  wholeLines: string[];
  rest: string;
}

export function extractLines(s: string): Extraction {
  const chunks = s.split('\n');

  return {
    wholeLines: chunks.slice(0, -1),
    rest: chunks.at(-1) || '',
  };
}
