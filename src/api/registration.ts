import { makeEmailAddress } from '../app/email-sending/emails';
import { EmailAddress } from '../domain/email-address';
import { Account, accountExists, storeAccount, AccountId, getAccountIdByEmail } from '../domain/account';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { hasKind, isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { makeNewPassword, NewPassword } from '../domain/new-password';
import { RequestHandler } from './request-handler';
import { makePlanId, PlanId } from '../domain/plan';
import { AppSettings } from '../domain/app-settings';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import { requireEnv } from '../shared/env';
import { HashedPassword, makeHashedPassword } from '../domain/hashed-password';
import {
  RegistrationConfirmationSecret,
  storeRegistrationConfirmationSecret,
  makeRegistrationConfirmationSecret,
} from '../domain/registration-confirmation-secrets';
import { si } from '../shared/string-utils';
import { PagePaths } from '../shared/page-paths';

export const registration: RequestHandler = async function registration(_reqId, reqBody, _reqParams, _reqSession, app) {
  const processInputResult = processInput(reqBody);

  if (isErr(processInputResult)) {
    return makeInputError<keyof Input>(processInputResult.reason, processInputResult.field);
  }

  const initAccountResult = initAccount(app, processInputResult);

  if (isErr(initAccountResult)) {
    return makeAppError(initAccountResult.reason);
  }

  if (isAccountAlreadyExists(initAccountResult)) {
    return makeInputError<keyof Input>('Email already taken', 'email');
  }

  const { email } = processInputResult;
  const sendConfirmationEmailResult = await sendConfirmationEmail(email, app.settings);

  if (isErr(sendConfirmationEmailResult)) {
    return makeAppError(sendConfirmationEmailResult.reason);
  }

  const accountId = initAccountResult;
  const storeConfirmationSecretResult = storeConfirmationSecret(app, email, accountId);

  if (isErr(storeConfirmationSecretResult)) {
    return makeAppError(storeConfirmationSecretResult.reason);
  }

  return makeSuccess('Account created. Welcome aboard! 🙂');
};

export function storeConfirmationSecret(
  { settings, storage }: App,
  emailAddress: EmailAddress,
  accountId: AccountId
): Result<void> {
  const module = si`${registration.name}-${storeConfirmationSecret.name}`;
  const { logError, logInfo } = makeCustomLoggers({ accountId, module });

  const confirmationSecret = makeConfirmationSecret(emailAddress, settings.hashingSalt);
  const result = storeRegistrationConfirmationSecret(storage, confirmationSecret, accountId);

  if (isErr(result)) {
    logError(si`Failed to ${storeRegistrationConfirmationSecret.name}`, { reason: result.reason });
    return makeErr('Couldn’t store confirmation secret');
  }

  logInfo('Stored registration confirmation secret');
}

async function sendConfirmationEmail(recipient: EmailAddress, settings: AppSettings): Promise<Result<void | AppError>> {
  const module = si`${registration.name}-${sendConfirmationEmail.name}`;
  const { logError, logInfo } = makeCustomLoggers({ email: recipient.value, module });

  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return makeAppError('Environment error');
  }

  const from = settings.fullEmailAddress;
  const replyTo = settings.fullEmailAddress.emailAddress;
  const confirmationLink = makeRegistrationConfirmationLink(recipient, settings.hashingSalt, env.DOMAIN_NAME);
  const emailContent = makeRegistrationConfirmationEmailContent(confirmationLink);
  const sendEmailResult = await sendEmail(from, recipient, replyTo, emailContent, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError('Couldn’t send registration confirmation email');
  }

  logInfo('Sent registration confirmation email');
}

export function makeRegistrationConfirmationLink(to: EmailAddress, appHashingSalt: string, domainName: string): URL {
  const url = new URL(si`https://${domainName}${PagePaths.registrationConfirmation}`);
  const secret = makeConfirmationSecret(to, appHashingSalt);

  url.searchParams.set('secret', secret.value);

  return url;
}

function makeConfirmationSecret(emailAddress: EmailAddress, appHashingSalt: string): RegistrationConfirmationSecret {
  // ASSUMPTION: SHA256 gives good enough uniqueness (extremely rare collisions).
  const emailAddressHash = hash(emailAddress.value, si`confirmation-secret-${appHashingSalt}`);

  return makeRegistrationConfirmationSecret(emailAddressHash);
}

export function makeRegistrationConfirmationEmailContent(confirmationLink: URL): EmailContent {
  return {
    subject: 'Please confirm FeedSubscription registration',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please confirm FeedSubscription registration by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm registration</a>.</p>

      <p>If you did not register, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };
}

interface Input {
  plan: string; // Maybe switch to 'unknown' type and see what comes out
  email: string;
  password: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  planId: PlanId;
  email: EmailAddress;
  password: NewPassword;
}

function processInput(input: Input): Result<ProcessedInput, keyof Input> {
  const module = si`${registration.name}-${processInput.name}`;
  const { logWarning } = makeCustomLoggers({ plan: input.plan, email: input.email, module });

  const planId = makePlanId(input.plan);

  if (isErr(planId)) {
    logWarning('Invalid plan ID', { input: input.plan, reason: planId.reason });
    return { ...planId, field: 'plan' };
  }

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { reason: email.reason });
    return { ...email, field: 'email' };
  }

  const password = makeNewPassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid new password', { password: input.password, reason: password.reason });
    return makeErr<keyof Input>(si`Invalid password: ${password.reason}`, 'password');
  }

  return {
    kind: 'ProcessedInput',
    planId,
    email,
    password,
  };
}

interface AccountAlreadyExists {
  kind: 'AccountAlreadyExists';
}

export function isAccountAlreadyExists(x: any): x is AccountAlreadyExists {
  return hasKind(x, 'AccountAlreadyExists');
}

function initAccount({ storage, settings }: App, input: ProcessedInput): Result<AccountId | AccountAlreadyExists> {
  const module = si`${registration.name}-${initAccount.name}`;
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module });

  const hashedPassword = hash(input.password.value, settings.hashingSalt);
  const account: Account = {
    planId: input.planId,
    email: input.email,
    hashedPassword: makeHashedPassword(hashedPassword) as HashedPassword,
    creationTimestamp: new Date(),
  };

  const accountId = getAccountIdByEmail(input.email, settings.hashingSalt);

  if (accountExists(storage, accountId)) {
    logWarning('Account already exists', { email: input.email.value });
    return { kind: 'AccountAlreadyExists' };
  }

  const storeAccountResult = storeAccount(storage, accountId, account);

  if (isErr(storeAccountResult)) {
    logError(si`Couldn’t ${storeAccount.name}`, { reason: storeAccountResult.reason });
    return makeErr('Couldn’t store account data');
  }

  logInfo('User registered', account);

  return accountId;
}
