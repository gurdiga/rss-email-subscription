import {
  EmailAddress,
  EmailHash,
  HashedEmail,
  indexEmails,
  loadStoredEmails,
  storeEmailIndex,
} from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr, makeErr, Result } from '../shared/lang';
import { logError } from '../shared/logging';

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
  const newHashedEmails = removeEmail(emailHash, validEmails);

  if (isErr(newHashedEmails)) {
    return newHashedEmails;
  }

  const feedSettings = getFeedSettings(dataDir);

  if (isErr(feedSettings)) {
    return feedSettings;
  }

  const { hashingSalt } = feedSettings;
  const newEmails = newHashedEmails.map((x) => x.emailAddress);

  // TODO: Maybe move to emails.ts?
  const hashEmail = (e: EmailAddress) => hash(e.value, hashingSalt);

  // TODO: Maybe re-create the index from newHashedEmails -- then no need to re-hash, no need to read feedSettings
  const emailIndex = indexEmails(newEmails, hashEmail);
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

export function removeEmail(emailHash: EmailHash, hashedEmails: HashedEmail[]): Result<HashedEmail[]> {
  if (!emailHash.trim()) {
    return makeErr('Email hash is an empty string or whitespace');
  }

  return hashedEmails.filter((x) => x.saltedHash !== emailHash);
}
