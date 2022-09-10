import { loadStoredEmails } from '../app/email-sending/emails';
import { makeDataDir } from '../shared/data-dir';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, parseSubscriptionId } from './shared';
import { makeAppError, makeInputError } from '../shared/api-response';
import { storeEmails } from './subscription';

export const confirmSubscription: AppRequestHandler = async function confirmSubscription(
  reqId,
  reqBody,
  _reqParams,
  dataDirRoot
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: confirmSubscription.name });
  const { id } = reqBody;
  const parseResult = parseSubscriptionId(id);

  if (isErr(parseResult)) {
    logWarning('Invalid subscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid confirmation link');
  }

  const { feedId, emailHash } = parseResult;
  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    logError(`Can’t make data dir from feedId "${feedId}": ${dataDir.reason}`);
    return makeAppError('Invalid confirmation link');
  }

  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const registeredEmail = validEmails.find((x) => x.saltedHash === emailHash);

  if (!registeredEmail) {
    logWarning('Email not registered yet', { emailHash });
    return makeInputError(
      'Email is not registered for confirmation. Maybe the confirmation link is expired? 🤔 Please try registering again.'
    );
  }

  registeredEmail.isConfirmed = true;

  const storeResult = storeEmails(storedEmails.validEmails, dataDir);

  if (isErr(storeResult)) {
    logError('Can’t store emails on confirm', { reason: storeResult.reason });
    return makeAppError('Database write error: registering confirmation failed');
  }

  logInfo('Confirmed email', { email: registeredEmail.emailAddress.value });

  return {
    kind: 'Success',
    message: 'Emai confirmed. Welcome aboard! 😎',
  };
};
