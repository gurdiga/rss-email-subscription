import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AccountData } from '../domain/account';
import { addEmailToIndex, findAccountIdByEmail } from '../domain/account-index';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { makeNewPassword, NewPassword } from '../domain/new-password';
import { AppRequestHandler } from './request-handler';
import { AppStorage } from '../shared/storage';
import { makePlanId, PlanId } from '../domain/plan';
import { AppSettings } from '../domain/app-settings';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import { requireEnv } from '../shared/env';
import { DOMAIN_NAME } from '../domain/feed-settings';

export const registration: AppRequestHandler = async function registration(_reqId, reqBody, _reqParams, app) {
  const { plan, email, password } = reqBody;
  const processInputResult = processInput(app.storage, { plan, email, password });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const initAccountResult = initAccount(app, processInputResult);

  if (isErr(initAccountResult)) {
    return makeAppError(initAccountResult.reason);
  }

  const bloggerEmail = processInputResult.email;
  const sendRegistrationConfirmationEmailResult = await sendRegistrationConfirmationEmail(bloggerEmail, app.settings);

  if (isErr(sendRegistrationConfirmationEmailResult)) {
    return makeAppError(sendRegistrationConfirmationEmailResult.reason);
  }

  return makeSuccess('Account created. Welcome aboard! 🙂');
};

async function sendRegistrationConfirmationEmail(
  to: EmailAddress,
  settings: AppSettings
): Promise<Result<void | AppError>> {
  const module = `${registration.name}:${sendRegistrationConfirmationEmail.name}`;
  const { logError, logInfo } = makeCustomLoggers({ email: to.value, module });

  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(`Invalid environment`, { reason: env.reason });
    return makeAppError('Environment error');
  }

  const from = settings.fullEmailAddress;
  const replyTo = settings.fullEmailAddress.emailAddress;
  const confirmationLink = makeRegistrationConfirmationLink(to, settings.hashingSalt);
  const emailContent = makeRegistrationConfirmationEmailContent(confirmationLink);
  const sendEmailResult = await sendEmail(from, to, replyTo, emailContent, env);

  if (isErr(sendEmailResult)) {
    logError('Can’t send registration confirmation email', { reason: sendEmailResult.reason });
    return makeAppError('Error sending registration confirmation email');
  }

  logInfo('Sent registration confirmation email');
}

export function makeRegistrationConfirmationLink(to: EmailAddress, appHashingSalt: string): URL {
  const url = new URL(`https://${DOMAIN_NAME}/registration-confirmation.html`);

  url.searchParams.set('secret', hash(to.value, appHashingSalt));

  return url;
}

export function makeRegistrationConfirmationEmailContent(confirmationLink: URL): EmailContent {
  return {
    subject: 'Please confirm FeedSubscription registration',
    htmlBody: `
      <p>Hi there,</p>

      <p>Please confirm FeedSubscription registration by clicking the link below:</p>

      <p><a href="${confirmationLink}">Yes, I confirm registration</a>.</p>

      <p>If you did not register, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };
}

interface Input {
  plan: string; // Maybe switch to `unknown` type and see what comes out
  email: string;
  password: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  plan: PlanId;
  email: EmailAddress;
  password: NewPassword;
}

function processInput(storage: AppStorage, input: Input): Result<ProcessedInput> {
  const module = `${registration.name}:${processInput.name}`;
  const { logWarning } = makeCustomLoggers({ plan: input.plan, email: input.email, module });

  const plan = makePlanId(input.plan);

  if (isErr(plan)) {
    logWarning('Invalid plan', { input: input.plan, reason: plan.reason });
    return { ...plan, field: 'plan' };
  }

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { reason: email.reason });
    return { ...email, field: 'email' };
  }

  const accountId = findAccountIdByEmail(storage, email);

  if (isErr(accountId)) {
    logWarning('Can’t verify email taken', { reason: accountId.reason });
    return makeErr('Can’t verify email taken', 'email');
  }

  if (typeof accountId === 'number') {
    logWarning('Email already taken');
    return makeErr('Email already taken', 'email');
  }

  const password = makeNewPassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid new password', { input: input.password, reason: password.reason });
    return makeErr(`Invalid password: ${password.reason}`, 'password');
  }

  return {
    kind: 'ProcessedInput',
    plan,
    email,
    password,
  };
}

function initAccount({ storage, settings }: App, input: ProcessedInput): Result<void> {
  const module = `${registration.name}:${initAccount.name}`;
  const { logInfo, logError } = makeCustomLoggers({ module });

  const accountId = new Date().getTime();
  const hashedPassword = hash(input.password.value, settings.hashingSalt);

  const accountData: AccountData = {
    plan: input.plan,
    email: input.email.value,
    hashedPassword: hashedPassword,
  };

  const result = storage.storeItem(`/accounts/${accountId}/account.json`, accountData);

  if (isErr(result)) {
    logError(`${storage.storeItem.name} failed`, { reason: result.reason });
    return makeErr('Couldn’t store account data');
  }

  const addAccountResult = addEmailToIndex(storage, accountId, input.email);

  if (isErr(addAccountResult)) {
    logError('Couldn’t add account to index', { accountId, email: input.email.value, reason: addAccountResult.reason });
    return makeErr('Couldn’t create account');
  }

  logInfo('Created new account', accountData);
}
