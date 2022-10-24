import { expect } from 'chai';
import fetch, { Headers } from 'node-fetch';
import { deleteAccount } from './src/api/delete-account-cli';
import { EmailAddress, makeEmailAddress } from './src/app/email-sending/emails';
import { AccountData } from './src/domain/account';
import { AppSettings } from './src/domain/app-settings';
import { ApiResponse, Success } from './src/shared/api-response';
import { hash } from './src/shared/crypto';
import { readFile } from './src/shared/io-isolation';

const dataDirRoot = process.env['DATA_DIR_ROOT'] || die('DATA_DIR_ROOT envar is missing');
const baseUrl = 'https://localhost.feedsubscription.com';

describe('API', () => {
  describe('registration-confirmation-authentication flow', () => {
    const userPlan = 'standard';
    const userEmail = 'api-test-blogger@feedsubscription.com';
    const userPassword = 'A-long-S3cre7-password';

    it('flows', async () => {
      const registrationresponse = await registrationDo(userPlan, userEmail, userPassword);
      const [account, accountId] = getAccountByEmail(userEmail);

      expect(registrationresponse.kind).to.equal('Success', 'registration');
      expect(account.plan).to.equal(userPlan, 'registration plan');
      expect(account.email).to.equal(userEmail, 'registration email');
      expect(account.hashedPassword).to.be.a('string', 'registration hashedPassword');
      expect(account.creationTimestamp).to.be.a('string', 'registration creationTimestamp');
      expect(account.confirmationTimestamp, 'registration confirmationTimestamp').to.be.undefined;

      const registrationConfirmationResponse = await registrationConfirmationDo(userEmail);
      expect(registrationConfirmationResponse.kind).to.equal('Success', 'registration confirmation');

      const [accountAfterConfirmation] = getAccountByEmail(userEmail);
      expect(accountAfterConfirmation.confirmationTimestamp).to.be.a('string', 'confirmation timestamp');

      const authenticationResponse = (await authenticationDo(userEmail, userPassword)) as Success;
      expect(authenticationResponse.kind).to.equal('Success', 'authentication');

      const sessionId = authenticationResponse.logData!['sessionId'];
      expect(sessionId, 'authentication response sessionId').to.exist;

      const sessionData = getSessionData(sessionId!);

      expect(sessionData.accountId).to.equal(accountId, 'authentication session accountId');
      expect(sessionData.cookie!.originalMaxAge).to.equal(172800000, 'authentication cookie maxAge');
      expect(sessionData.cookie!.sameSite).to.equal('strict', 'authentication cookie sameSite');
      expect(sessionData.cookie!.httpOnly).to.equal(true, 'authentication cookie httpOnly');
    }).timeout(5000);

    after(() => {
      deleteAccount(makeEmailAddress(userEmail) as EmailAddress);
    });

    async function registrationDo(plan: string, email: string, password: string) {
      return post('/registration', { plan, email, password });
    }

    async function registrationConfirmationDo(email: string) {
      const appSettings = loadJSON(`./${dataDirRoot}/settings.json`) as AppSettings;
      const secret = hash(email, appSettings.hashingSalt);

      return post('/registration-confirmation', { secret });
    }

    async function authenticationDo(email: string, password: string) {
      return post('/authentication', { email, password });
    }
  });

  describe('subscription-confirmation-unsubscription flow', () => {
    const emailHash = 'b617571ab1974d3614e5f6c48449e08dc0129aa0f28f16a9d5e3cb9ee1f7c29b'; // echo -n "${SUBSCRIBER_EMAIL}${FEED_HASHING_SALT}" | sha256sum
    const feedId = 'gurdiga';
    const subscriberEmail = 'api-test@feedsubscription.com';

    it('flows', async () => {
      const subscriptionResult = await subscriptionDo(feedId, subscriberEmail);
      expect(subscriptionResult.kind).to.equal('Success', 'subscription result');

      const repeatedSubscriptionResult = await subscriptionDo(feedId, subscriberEmail);
      expect(repeatedSubscriptionResult).to.deep.equal(
        { kind: 'InputError', message: 'Email is already subscribed' },
        'repeated subscription result'
      );

      const emails = getFeedSubscriberEmails(feedId);
      expect(emails, 'email recorded with feed').to.include.keys(`${emailHash}`);
      expect(emails[emailHash].isConfirmed).to.be.false;

      const subscriptionConfirmationResult = await subscriptionConfirmationDo(feedId, emailHash);
      expect(subscriptionConfirmationResult.kind).to.equal('Success');

      const emailAfterConfirmation = getFeedSubscriberEmails(feedId);
      expect(emailAfterConfirmation[emailHash].isConfirmed).to.be.true;

      const unsubscriptionResult = await unsubscriptionDo(feedId, emailHash);

      expect(unsubscriptionResult.kind).to.equal('Success', 'unsubscription result');
      expect(getFeedSubscriberEmails(feedId), 'email removed from feed').not.to.include.keys(`${emailHash}`);

      const repeatedUnsubscriptionResult = await unsubscriptionDo(feedId, emailHash);

      expect(repeatedUnsubscriptionResult).to.deep.equal(
        { kind: 'Success', message: 'Solidly unsubscribed.' },
        'repeated unsubscription'
      );
    });

    after(async () => {
      await unsubscriptionDo(feedId, emailHash);
    });

    async function subscriptionDo(feedId: string, email: string) {
      return post('/subscription', { feedId, email });
    }

    async function subscriptionConfirmationDo(feedId: string, emailHash: string) {
      return post('/subscription-confirmation', { id: `${feedId}-${emailHash}` });
    }

    async function unsubscriptionDo(feedId: string, emailHash: string) {
      return post('/unsubscription', { id: `${feedId}-${emailHash}` });
    }

    function getFeedSubscriberEmails(feedId: string) {
      return loadJSON(`${dataDirRoot}/feeds/${feedId}/emails.json`);
    }
  });

  describe('http session test', () => {
    it('works', async () => {
      const response = await get('/session-test');
      expect(response.kind).to.equal('Success');

      const sessionId = (response as Success).logData!['sessionId']!;
      expect(sessionId).to.exist;

      const sessionData = getSessionData(sessionId);
      expect(sessionData['works']).to.equal(true);
    });
  });

  describe('web-ui-scripts', () => {
    it('are served', async () => {
      const response = await get('/web-ui-scripts/web-ui/unsubscription-confirmation.js', 'text');
      const expectedFileSize = 3217;

      expect(response).to.exist;
      expect(response.length).to.equal(expectedFileSize);
    });
  });

  describe('CORP policy', () => {
    it('allows embedding JS', async () => {
      const [_, headers] = await get('/web-ui-scripts/web-ui/subscription-form.js', 'text', true);

      expect(headers.get('cross-origin-resource-policy')).to.equal('cross-origin');
    });
  });

  describe('CORS policy', () => {
    it('is widely open', async () => {
      const [response, headers] = await get('/cors-test', 'text', true);

      expect(response).to.equal('CORS test');
      expect(headers.get('access-control-allow-origin')).to.equal('*');
    });
  });

  describe('API code Git revisions', () => {
    it('is available', async () => {
      const response = await get('/api-version.txt', 'text');
      const gitRevisionMask = /[a-f0-9]{40}\n/m;

      expect(response).to.match(gitRevisionMask);
    });
  });
});

function die(errorMessage: string) {
  throw new Error(errorMessage);
}

async function post(path: string, data: Record<string, string>): Promise<ApiResponse> {
  return await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    body: new URLSearchParams(data),
  }).then((response) => response.json());
}

async function get(path: string, type: 'text'): Promise<string>;
async function get(path: string, type: 'text', includeHeaders: boolean): Promise<[string, Headers]>;
async function get(path: string, type: 'json', includeHeaders: boolean): Promise<[string, Headers]>;
async function get(path: string, type: 'json'): Promise<ApiResponse>;
async function get(path: string): Promise<ApiResponse>;
async function get(
  path: string,
  type: 'json' | 'text' = 'json',
  includeHeaders: boolean = false
): Promise<ApiResponse | string | [string, Headers]> {
  const response = await fetch(`${baseUrl}${path}`);
  const responseBody = await response[type]();

  if (includeHeaders) {
    return [responseBody, response.headers];
  } else {
    return responseBody;
  }
}

function getAccountByEmail(email: string): [AccountData, number] {
  const accountsRootDir = `${dataDirRoot}/accounts`;
  const index = loadJSON(`./${accountsRootDir}/index.json`);
  const userIds = Object.entries(index)
    .filter(([k, _v]) => k !== 'version')
    .map(([_k, v]) => v);

  const accounts = userIds
    .map((userId) => [loadJSON(`./${accountsRootDir}/${userId}/account.json`), userId] as [AccountData, number])
    .filter(([account]) => account.email === email);

  console.assert(accounts.length === 1, `Expected a single account file but found ${accounts.length}`);

  return accounts[0]!;
}

function getSessionData(sessionId: string) {
  return loadJSON(`./${dataDirRoot}/sessions/${sessionId}.json`);
}

function loadJSON(filePath: string) {
  const jsonString = readFile(filePath);
  return JSON.parse(jsonString);
}
