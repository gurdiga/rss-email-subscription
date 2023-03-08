import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { AccountId, EmailChangeResponse, makeEmailChangeRequest, UiAccount } from '../domain/account';
import { setAccountNewUnconfirmedEmail, loadAccount } from '../domain/account-storage';
import { ConfirmationSecret, makeConfirmationSecret, storeConfirmationSecret } from '../domain/confirmation-secrets';
import { PagePath } from '../domain/page-path';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const loadCurrentAccount: RequestHandler = async function loadCurrentAccount(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: loadCurrentAccount.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const account = loadAccount(app.storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeAppError('Application error');
  }

  const logData = {};
  const responseData: UiAccount = {
    email: account.email.value,
  };

  return makeSuccess<UiAccount>('Success', logData, responseData);
};

export const changeAccountEmail: RequestHandler = async function changeAccountEmail(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: changeAccountEmail.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const request = makeEmailChangeRequest(reqBody);

  if (isErr(request)) {
    logWarning('Invalid EmailChangeRequest', { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const result = setAccountNewUnconfirmedEmail(accountId, request.newEmail, storage);

  if (isErr(result)) {
    logError(si`Failed to ${setAccountNewUnconfirmedEmail.name}`, { reason: result.reason });
    return makeAppError('Application error');
  }

  const secret = hash(request.newEmail.value, si`email-change-confirmation-secret-${settings.hashingSalt}`);
  const confirmationSecret = makeConfirmationSecret(secret);

  if (isErr(confirmationSecret)) {
    logError(si`Failed to ${makeConfirmationSecret.name}`, { secret, reason: confirmationSecret.reason });
    return makeAppError('App error');
  }

  const emailContent = makeEmailChangeConfirmationEmailContent(env.DOMAIN_NAME, confirmationSecret);
  const sendEmailResult = await sendEmail(
    settings.fullEmailAddress,
    request.newEmail,
    settings.fullEmailAddress.emailAddress,
    emailContent,
    env
  );

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError('Application error');
  }

  const timestamp = new Date();
  const confirmationSecretData: EmailChangeConfirmationSecretData = { accountId, timestamp };
  const storeConfirmationSecretResult = storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);

  if (isErr(storeConfirmationSecretResult)) {
    logError(si`Failed to ${storeConfirmationSecret.name}`, { reason: storeConfirmationSecretResult.reason });
    return makeAppError('Application error');
  }

  const logData = {};
  const responseData: EmailChangeResponse = {
    newEmail: request.newEmail.value,
  };

  return makeSuccess('Success', logData, responseData);
};

export function makeEmailChangeConfirmationEmailContent(
  domainName: string,
  confirmationSecret: ConfirmationSecret
): EmailContent {
  const confirmationLink = new URL(si`https://${domainName}${PagePath.emailChangeConfirmation}`);

  confirmationLink.searchParams.set('secret', confirmationSecret.value);

  return {
    subject: 'Please confirm FeedSubscription email change',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please confirm <b><font color="#0163ee">Feed</font>Subscription</b> email change by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm email change</a>.</p>

      <p>If you did not initiate an account email change, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };
}

// We’ll record this data just for debugging potential issues.
interface EmailChangeConfirmationSecretData {
  accountId: AccountId;
  timestamp: Date;
}
