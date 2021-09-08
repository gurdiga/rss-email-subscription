import { EmailHash, HashedEmail, loadStoredEmails, storeEmailIndex } from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { isErr, makeErr, Result } from '../shared/lang';

interface Success {
  kind: 'Success';
}

interface NotFound {
  kind: 'NotFound';
}

export function unsubscribe(id: any, dataDirRoot: string): Result<Success | NotFound> {
  const unsubscriptionId = parseUnsubscriptionId(id, dataDirRoot);

  if (isErr(unsubscriptionId)) {
    return unsubscriptionId;
  }

  const { dataDir, emailHash } = unsubscriptionId;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    return storedEmails;
  }

  const { validEmails } = storedEmails;

  if (!validEmails.some((x) => x.saltedHash === emailHash)) {
    return { kind: 'NotFound' };
  }

  const newHashedEmails = removeEmail(emailHash, validEmails);

  if (isErr(newHashedEmails)) {
    return newHashedEmails;
  }

  const emailIndex = Object.fromEntries(newHashedEmails.map((x) => [x.saltedHash, x.emailAddress.value]));
  const result = storeEmailIndex(dataDir, emailIndex);

  if (isErr(result)) {
    return result;
  }

  return { kind: 'Success' };
}

interface UnsubscriptionId {
  dataDir: DataDir;
  emailHash: EmailHash;
}

export function parseUnsubscriptionId(id: any, dataDirRoot: string): Result<UnsubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const [feedId, emailHash] = id?.split('-');

  if (!emailHash) {
    return makeErr(`Email hash is missing`);
  }

  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    return makeErr(`Invalid feed ID: ${dataDir.reason}`);
  }

  return {
    dataDir,
    emailHash,
  };
}

export function removeEmail(emailHash: EmailHash, hashedEmails: HashedEmail[]): Result<HashedEmail[]> {
  if (!emailHash.trim()) {
    return makeErr('Email hash is an empty string or whitespace');
  }

  return hashedEmails.filter((x) => x.saltedHash !== emailHash);
}
