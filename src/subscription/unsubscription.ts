import { EmailHash, HashedEmail, loadStoredEmails } from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { isErr, makeErr, Result } from '../shared/lang';

type Unsubscription = NotFound | Success;

interface NotFound {
  kind: 'NotFound';
}

interface Success {
  kind: 'Success';
}

export function unsubscribe(id: any): Result<Unsubscription> {
  const unsubscriptionId = parseUnsubscriptionId(id);

  if (isErr(unsubscriptionId)) {
    return unsubscriptionId;
  }

  const { dataDir, emailHash } = unsubscriptionId;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    return storedEmails;
  }

  const { validEmails } = storedEmails;
  const removalResult = removeEmail(emailHash, validEmails) as Result<HashedEmail[]>;

  if (isErr(removalResult)) {
    return removalResult;
  }

  const newHashedEmails = removalResult;
  const result = storeHashedEmails(newHashedEmails) as Result<void>;

  if (isErr(result)) {
    return result;
  }

  return { kind: 'Success' };
}

interface UnsubscriptionId {
  dataDir: DataDir;
  emailHash: EmailHash;
}

export function parseUnsubscriptionId(id: any): Result<UnsubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const [feedId, emailHash] = id?.split('-');

  if (!emailHash) {
    return makeErr(`Email hash is missing`);
  }

  const dataDir = makeDataDir(feedId);

  if (isErr(dataDir)) {
    return makeErr(`Invalid feed ID: ${dataDir.reason}`);
  }

  return {
    dataDir,
    emailHash,
  };
}

function removeEmail(emailHash: EmailHash, hashedEmails: HashedEmail[]): Result<HashedEmail[]> {
  // TODO
  return makeErr('Not implemented: removeEmail');
}

function storeHashedEmails(hashedEmails: HashedEmail[]): Result<void> {
  // TODO
  return makeErr('Not implemented: storeHashedEmails');
}
