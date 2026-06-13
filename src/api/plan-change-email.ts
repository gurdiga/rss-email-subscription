import { htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import { AppSettings } from '../domain/app-settings';
import { EmailAddress } from '../domain/email-address';
import { PagePath } from '../domain/page-path';
import { si } from '../shared/string-utils';
import { AppEnv } from './init-app';

export async function sendWelcomeEmail(email: EmailAddress, settings: AppSettings, env: AppEnv) {
  const feedListUrl = si`https://${env.DOMAIN_NAME}${PagePath.feedList}`;
  const emailContent = {
    subject: 'Welcome to FeedSubscription',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Your account is now active. You can get started at
      <a href="${feedListUrl}">${feedListUrl}</a>.</p>

      <p>Have a nice day.</p>
    `),
  };

  return await sendEmail(settings.fullEmailAddress, email, settings.fullEmailAddress.emailAddress, emailContent, env);
}

export async function sendPlanChangeInformationEmail(
  oldPlanTitle: string,
  newPlanTitle: string,
  email: EmailAddress,
  settings: AppSettings,
  env: AppEnv
) {
  const emailContent = {
    subject: 'Please note FeedSubscription plan change',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Please note that your plan at FeedSubscription.com has been
      changed from <b>${oldPlanTitle}</b> to <b>${newPlanTitle}</b>.</p>

      <p>Have a nice day.</p>
    `),
  };

  return await sendEmail(settings.fullEmailAddress, email, settings.fullEmailAddress.emailAddress, emailContent, env);
}
