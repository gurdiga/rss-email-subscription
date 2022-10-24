import { expect } from 'chai';
import fetch from 'node-fetch';
import { deleteAccount } from './src/api/delete-account-cli';
import { EmailAddress, makeEmailAddress } from './src/app/email-sending/emails';
import { AccountData } from './src/domain/account';
import { AppSettings } from './src/domain/app-settings';
import { ApiResponse, Success } from './src/shared/api-response';
import { hash } from './src/shared/crypto';
import { readFile } from './src/shared/io-isolation';

const dataDirRoot = process.env['DATA_DIR_ROOT'] || die('DATA_DIR_ROOT envar is missing');

const baseUrl = 'https://localhost.feedsubscription.com';
const subscriberEmail = 'api-test@feedsubscription.com';
subscriberEmail;
const emailHash = 'api-test@feedsubscription.com';
emailHash; // echo -n "${SUBSCRIBER_EMAIL}${FEED_HASHING_SALT}" | sha256sum
const geedId = 'gurdiga';
geedId;
const emailDataFile = `${dataDirRoot}/feeds/$FEED_ID/emails.json`;
emailDataFile;

const userPlan = 'standard';
const userEmail = 'api-test-blogger@feedsubscription.com';
const userPassword = 'A-long-S3cre7-password';

describe('API', () => {
  describe('registration-confirmation-authentication flow', () => {
    it('flows', async () => {
      const registrationresponse = await registrationDo(userPlan, userEmail, userPassword);
      const [account, accountId] = getAccountByEmail(userEmail);

      expect(registrationresponse.kind).to.equal('Success', 'Registration failed');
      expect(account.plan).to.equal(userPlan, 'registration plan');
      expect(account.email).to.equal(userEmail, 'registration email');
      expect(account.hashedPassword).to.be.a('string', 'registration hashedPassword');
      expect(account.creationTimestamp).to.be.a('string', 'registration creationTimestamp');
      expect(account.confirmationTimestamp, 'registration confirmationTimestamp').to.be.undefined;

      const registrationConfirmationResponse = await registrationConfirmationDo(userEmail);
      expect(registrationConfirmationResponse.kind).to.equal('Success', 'Registration confirmation failed');

      const [accountAfterConfirmation] = getAccountByEmail(userEmail);
      expect(accountAfterConfirmation.confirmationTimestamp).to.be.a('string', 'confirmation timestamp');

      const authenticationResponse = (await authenticationDo(userEmail, userPassword)) as Success;
      expect(authenticationResponse.kind).to.equal('Success', 'Authentication failed');

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

function die(errorMessage: string) {
  throw new Error(errorMessage);
}

async function post(path: string, data: Record<string, string>): Promise<ApiResponse> {
  return await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    body: new URLSearchParams(data),
  }).then((response) => response.json());
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
