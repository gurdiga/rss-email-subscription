import { DataDir, makeDataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { Args } from '../shared/process-utils';

export type EmailSendingArgs = Args<[DataDir]>;

// TODO: Inline this function.
export function parseArgs(dataDirString?: string): Result<EmailSendingArgs> {
  const dataDir = makeDataDir(dataDirString);

  if (dataDir.kind === 'DataDir') {
    return {
      kind: 'Args',
      values: [dataDir],
    };
  } else {
    return makeErr(`Invalid dataDir: ${dataDir.reason}`);
  }
}
