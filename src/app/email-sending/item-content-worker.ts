import path from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { FeedEmailBodySpec, FeedEmailSubjectSpec } from '../../domain/feed';
import { attempt, getErrorMessage, isErr, makeErr, Result } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { ItemContentSource, ItemEmailContent, makeItemEmailContent } from './email-content';

export interface ItemContentWorkerLimits {
  timeoutMs: number;
  maxOldGenerationSizeMb: number;
}

// Real items take at most 25 ms on a laptop. Parsing deeply nested
// markup is superlinear in every HTML parser tried: half a MiB of
// nested div elements takes about a minute. The heap cap sits under the
// container limits in docker-compose.yml.
export const defaultItemContentWorkerLimits: ItemContentWorkerLimits = {
  timeoutMs: 5000,
  maxOldGenerationSizeMb: 192,
};

// Parses in a worker thread so that a hostile item fails alone, with an
// Err, instead of blocking the event loop or exhausting the process
// heap. One worker at a time per process, so that their heaps don't add
// up.
export function makeItemEmailContentInWorker(
  item: ItemContentSource,
  emailBodySpec: FeedEmailBodySpec,
  emailSubjectSpec: FeedEmailSubjectSpec,
  limits = defaultItemContentWorkerLimits
): Promise<Result<ItemEmailContent>> {
  const job: ItemContentJob = {
    kind: 'ItemContentJob',
    title: item.title,
    content: item.content,
    link: item.link.toString(),
    emailBodySpec,
    emailSubjectSpec,
  };
  // runWorker resolves with an Err rather than rejecting; the catch is
  // a backstop for whatever it misses. It also keeps the queue usable:
  // a rejected queue would skip every later .then, failing every item
  // after it until restart.
  const run = queue
    .then(() => runWorker(job, limits))
    .catch((error) => makeErr(si`Worker failed unexpectedly: ${getErrorMessage(error)}`));

  queue = run;

  return run;
}

let queue: Promise<unknown> = Promise.resolve();

interface ItemContentJob {
  kind: 'ItemContentJob';
  title: string;
  content: string;
  link: string;
  emailBodySpec: FeedEmailBodySpec;
  emailSubjectSpec: FeedEmailSubjectSpec;
}

function runWorker(job: ItemContentJob, limits: ItemContentWorkerLimits): Promise<Result<ItemEmailContent>> {
  return new Promise((resolve) => {
    const worker = attempt(
      () =>
        new Worker(workerPath, {
          workerData: job,
          resourceLimits: { maxOldGenerationSizeMb: limits.maxOldGenerationSizeMb },
          execArgv: isTypeScript ? ['--require', 'ts-node/register'] : process.execArgv,
        })
    );

    if (isErr(worker)) {
      resolve(makeErr(si`Failed to start the worker: ${worker.reason}`));
      return;
    }

    let isDone = false;

    const finish = (result: Result<ItemEmailContent>) => {
      if (isDone) {
        return;
      }

      isDone = true;
      clearTimeout(timer);

      // Only once it has exited, so that the next queued worker doesn't
      // overlap it.
      worker.terminate().then(
        () => resolve(result),
        () => resolve(result)
      );
    };

    const timer = setTimeout(() => finish(makeErr(si`Timed out after ${limits.timeoutMs} ms`)), limits.timeoutMs);

    worker.once('message', (result: Result<ItemEmailContent>) => finish(result));
    worker.once('error', (error) => finish(makeErr(si`Worker failed: ${getErrorMessage(error)}`)));
    worker.once('exit', (code) => finish(makeErr(si`Worker exited with code ${code}`)));
  });
}

// Under mocha or the ts-node CLI the modules are TypeScript, which a
// worker can't load without ts-node; in the image they are the compiled
// JavaScript in dist. Not the parent's execArgv then: under the ts-node
// CLI it holds ts-node's own script and arguments, which would start
// the worker as that script instead.
const isTypeScript = path.extname(__filename) === '.ts';
const workerPath = __filename;

if (!isMainThread && (workerData as ItemContentJob | undefined)?.kind === 'ItemContentJob') {
  const job = workerData as ItemContentJob;
  const item: ItemContentSource = { title: job.title, content: job.content, link: new URL(job.link) };

  parentPort?.postMessage(makeItemEmailContent(item, job.emailBodySpec, job.emailSubjectSpec));
}
