import { loadStoredEmails } from '../email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, makeAppError, makeInputError, parseSubscriptionId } from './shared';
import { storeEmails } from './subscription';

export const confirmSubscription: AppRequestHandler = function confirmSubscription(
  reqId,
  reqBody,
  _reqParams,
  dataDirRoot
) {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: confirmSubscription.name });
  const { id } = reqBody;
  const parseResult = parseSubscriptionId(id, dataDirRoot);

  if (isErr(parseResult)) {
    logWarning('Invalid subscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid confirmation link');
  }

  const { dataDir, emailHash } = parseResult;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const registeredEmail = validEmails.find((x) => x.saltedHash === emailHash);

  if (!registeredEmail) {
    logWarning('Email not registered yet', { emailHash });
    return makeInputError('Email is not registered. You first need to ask for subscription, and only then confirm.');
  }

  registeredEmail.isConfirmed = true;

  const storeResult = storeEmails(storedEmails.validEmails, dataDir);

  if (isErr(storeResult)) {
    logError('Can’t store emails on confirm', { reason: storeResult.reason });
    return makeAppError('Database write error: registering confirmation failed');
  }

  // TODO: Add to api-test

  return {
    kind: 'Success',
    message: 'Emai confirmed. Welcome aboard! 😎',
  };
};
