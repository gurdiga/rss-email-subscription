import { EmailHash, HashedEmail, loadStoredEmails, storeEmails } from '../email-sending/emails';
import { DataDir } from '../shared/data-dir';
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

function parseUnsubscriptionId(id: any): Result<UnsubscriptionId> {
  // TODO
  return makeErr('Not implemented: parseUnsubscriptionId');
}

function removeEmail(emailHash: EmailHash, hashedEmails: HashedEmail[]): Result<HashedEmail[]> {
  // TODO
  return makeErr('Not implemented: removeEmail');
}

function storeHashedEmails(hashedEmails: HashedEmail[]): Result<void> {
  // TODO
  return makeErr('Not implemented: storeHashedEmails');
}
