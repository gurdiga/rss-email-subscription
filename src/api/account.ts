import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { EmailChangeResponse, makeEmailChangeRequest, UiAccount } from '../domain/account';
import { setAccountNewUnconfirmedEmail, loadAccount } from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { PagePath } from '../domain/page-path';
import {
  makeRegistrationConfirmationSecret,
  RegistrationConfirmationSecret,
} from '../domain/registration-confirmation-secrets';
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

  // TODO:
  // - Send confirmation email

  const confirmationLink = makeEmailChangeConfirmationLink(request.newEmail, settings.hashingSalt, env.DOMAIN_NAME);
  const emailContent = makeEmailChangeConfirmationEmailContent(confirmationLink);
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

  const logData = {};
  const responseData: EmailChangeResponse = {
    newEmail: request.newEmail.value,
  };

  return makeSuccess('Success', logData, responseData);
};

export function makeEmailChangeConfirmationLink(to: EmailAddress, appHashingSalt: string, domainName: string): URL {
  const url = new URL(si`https://${domainName}${PagePath.emailChangeConfirmation}`);
  const secret = makeEmailConfirmationSecret(to, appHashingSalt);

  url.searchParams.set('secret', secret.value);

  return url;
}

// TODO: Store confirmation secrets separately or re-use registration confirmation secrets?

function makeEmailConfirmationSecret(
  emailAddress: EmailAddress,
  appHashingSalt: string
): RegistrationConfirmationSecret {
  // ASSUMPTION: SHA256 gives good enough uniqueness (extremely rare collisions).
  const emailAddressHash = hash(emailAddress.value, si`email-change-confirmation-secret-${appHashingSalt}`);

  return makeRegistrationConfirmationSecret(emailAddressHash);
}

export function makeEmailChangeConfirmationEmailContent(confirmationLink: URL): EmailContent {
  return {
    subject: 'Please confirm FeedSubscription email change',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please confirm <b><font color="#0163ee">Feed</font>Subscription</b> email change by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm registration</a>.</p>

      <p>If you did not register, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };
}
