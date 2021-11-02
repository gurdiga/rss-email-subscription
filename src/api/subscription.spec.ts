import { expect } from 'chai';
import {
  EmailAddress,
  EmailHashFn,
  loadStoredEmails,
  makeEmailAddress,
  makeEmailHashFn,
  makeHashedEmail,
  StoredEmails,
} from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { writeFile, WriteFileFn } from '../shared/io';
import { isErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { Success } from './shared';

describe(subscribe.name, () => {
  it('exists', () => {
    expect(subscribe).to.be.an.instanceOf(Function);
  });
});

// CSRF?

interface AlreadyRegistered {
  kind: 'AlreadyRegistered';
}

function subscribe(
  emailString: string,
  feedId: string,
  dataDirRoot: string,
  { logWarning } = makeCustomLoggers({ module: 'subscription' })
): Result<Success | AlreadyRegistered> {
  const emailAddress = makeEmailAddress(emailString);

  if (isErr(emailAddress)) {
    return emailAddress;
  }

  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    return dataDir;
  }

  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    return storedEmails;
  }

  if (storedEmails.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: storedEmails.invalidEmails });
  }

  if (emailAlreadyExists(emailAddress, storedEmails)) {
    return { kind: 'AlreadyRegistered' };
  }

  const feedSettings = getFeedSettings(dataDir);

  if (isErr(feedSettings)) {
    return feedSettings;
  }

  const newEmails = addEmail(emailAddress, storedEmails, makeEmailHashFn(feedSettings.hashingSalt));
  const result = storeEmails(newEmails, dataDir);

  if (isErr(result)) {
    return result;
  }

  return { kind: 'Success' };
}

function storeEmails(newEmails: StoredEmails, dataDir: DataDir, writeFileFn: WriteFileFn = writeFile): Result<void> {
  // TDOO
}

function addEmail(emailAddress: EmailAddress, storedEmails: StoredEmails, emailHashFn: EmailHashFn): StoredEmails {
  const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);

  storedEmails.validEmails.push(hashedEmail);

  return storedEmails;
}

function emailAlreadyExists(emailAddress: EmailAddress, storedEmails: StoredEmails): boolean {
  const { validEmails } = storedEmails;
  const alreadyExists = validEmails.some((x) => x.emailAddress.value === emailAddress.value);

  return alreadyExists;
}
