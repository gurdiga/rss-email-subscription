import { expect } from 'chai';
import fetch, { Headers } from 'node-fetch';
import { deleteAccount } from './src/api/delete-account-cli';
import { EmailAddress, makeEmailAddress } from './src/app/email-sending/emails';
import { AccountData, AccountId, getAccountIdByEmail, getAccountStorageKey } from './src/domain/account';
import { AppSettings, appSettingsStorageKey } from './src/domain/app-settings';
import { cronPatternBySchedule } from './src/domain/cron-pattern';
import { Feed, FeedId, getFeedJsonStorageKey, getFeedStorageKey, makeFeedId, MakeFeedInput } from './src/domain/feed';
import { ApiResponse, Success } from './src/shared/api-response';
import { hash } from './src/shared/crypto';
import { readFile } from './src/shared/io-isolation';
import { si } from './src/shared/string-utils';
import { makePath } from './src/shared/path-utils';
import { die } from './src/shared/test-utils';

const dataDirRoot = process.env['DATA_DIR_ROOT'] || die('DATA_DIR_ROOT envar is missing');
const apiBaseUrl = 'https://localhost.feedsubscription.com/api';

describe('API', () => {
  const userEmail = 'api-test-blogger@feedsubscription.com';
  const userPassword = 'A-long-S3cre7-password';
  const userPlan = 'standard';

  describe('registration-confirmation-authentication-deauthentication flow', () => {
    it('flows', async () => {
      const { responseBody: registrationResponse } = await registrationDo(userPlan, userEmail, userPassword);
      const [account, accountId] = getAccountByEmail(userEmail);

      expect((registrationResponse as Success).kind).to.equal('Success', 'registration');
      expect(account.plan).to.equal(userPlan, 'registration plan');
      expect(account.email).to.equal(userEmail, 'registration email');
      expect(account.hashedPassword).to.be.a('string', 'registration hashedPassword');
      expect(account.creationTimestamp).to.be.a('string', 'registration creationTimestamp');
      expect(account.confirmationTimestamp, 'registration confirmationTimestamp').to.be.undefined;

      const { responseBody: repeatedRegistration } = await registrationDo(userPlan, userEmail, userPassword);
      expect(repeatedRegistration).to.deep.equal({
        field: 'email',
        kind: 'InputError',
        message: 'Email already taken',
      });

      const { responseBody: registrationConfirmationResponse } = await registrationConfirmationDo(userEmail);
      expect(registrationConfirmationResponse.kind).to.equal('Success', 'registration confirmation');

      let sessionId = (registrationConfirmationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'registration confirmation response sessionId').to.exist;

      const sessionDataAfterConfirmation = getSessionData(sessionId!);
      expect(sessionDataAfterConfirmation.accountId).to.equal(accountId, 'registration confirmation session accountId');

      const [accountAfterConfirmation] = getAccountByEmail(userEmail);
      expect(accountAfterConfirmation.confirmationTimestamp).to.be.a('string', 'confirmation timestamp');

      const { responseBody: authenticationResponse, responseHeaders } = await authenticationDo(userEmail, userPassword);
      expect(authenticationResponse.kind).to.equal('Success', 'authentication');

      sessionId = (authenticationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'authentication response sessionId').to.exist;

      const sessionData = getSessionData(sessionId!);
      const sessionCookie = sessionData.cookie!;

      expect(sessionData.accountId).to.equal(accountId, 'authentication session accountId');
      expect(sessionCookie.originalMaxAge).to.equal(172800000, 'authentication cookie maxAge');
      expect(sessionCookie.sameSite).to.equal('strict', 'authentication cookie sameSite');
      expect(sessionCookie.httpOnly).to.equal(true, 'authentication cookie httpOnly');

      expect(new Date(sessionCookie.expires)).is.greaterThan(
        new Date(sessionDataAfterConfirmation.cookie!.expires),
        'authentication session is rolling'
      );

      const { responseBody: deauthenticationResponse } = await deauthenticationDo(responseHeaders);
      expect(deauthenticationResponse.kind).to.equal('Success', 'deauthentication');

      const sessionDataAfterDeauthentication = getSessionData(sessionId!);
      expect(sessionDataAfterDeauthentication.accountId, 'deauthentication removes accountId from session').not.to
        .exist;
    }).timeout(5000);

    after(() => {
      deleteAccount(makeEmailAddress(userEmail) as EmailAddress);
    });

    async function deauthenticationDo(responseHeaders: Headers) {
      const cookie = responseHeaders.get('set-cookie')!;
      const headers = new Headers({ cookie });
      const data = {};

      return post('/deauthentication', data, headers);
    }
  });

  describe('subscription-confirmation-unsubscription flow', () => {
    const emailHash = 'b617571ab1974d3614e5f6c48449e08dc0129aa0f28f16a9d5e3cb9ee1f7c29b'; // echo -n "$SUBSCRIBER_EMAIL$FEED_HASHING_SALT" | sha256sum
    const feedId = makeFeedId('gurdiga') as FeedId;
    const subscriberEmail = 'api-test@feedsubscription.com';

    it('flows', async () => {
      const { responseBody: subscriptionResult } = await subscriptionDo(feedId, subscriberEmail);
      expect(subscriptionResult.kind).to.equal('Success', 'subscription result');

      const { responseBody: repeatedSubscriptionResult } = await subscriptionDo(feedId, subscriberEmail);
      expect(repeatedSubscriptionResult).to.deep.equal(
        { kind: 'InputError', message: 'Email is already subscribed' },
        'repeated subscription result'
      );

      const emails = getFeedSubscriberEmails(feedId);
      expect(emails, 'email recorded with feed').to.include.keys(emailHash);
      expect(emails[emailHash].isConfirmed).to.be.false;

      const { responseBody: subscriptionConfirmationResult } = await subscriptionConfirmationDo(feedId, emailHash);
      expect(subscriptionConfirmationResult.kind).to.equal('Success');

      const emailAfterConfirmation = getFeedSubscriberEmails(feedId);
      expect(emailAfterConfirmation[emailHash].isConfirmed).to.be.true;

      const { responseBody: unsubscriptionResult } = await unsubscriptionDo(feedId, emailHash);

      expect(unsubscriptionResult.kind).to.equal('Success', 'unsubscription result');
      expect(getFeedSubscriberEmails(feedId), 'email removed from feed').not.to.include.keys(emailHash);

      const { responseBody: repeatedUnsubscriptionResult } = await unsubscriptionDo(feedId, emailHash);

      expect(repeatedUnsubscriptionResult).to.deep.equal(
        { kind: 'Success', message: 'Solidly unsubscribed.' },
        'repeated unsubscription'
      );
    });

    after(async () => {
      await unsubscriptionDo(feedId, emailHash);
    });

    async function subscriptionDo(feedId: FeedId, email: string) {
      return post('/subscription', { feedId: feedId.value, email });
    }

    async function subscriptionConfirmationDo(feedId: FeedId, emailHash: string) {
      return post('/subscription-confirmation', { id: si`${feedId.value}-${emailHash}` });
    }

    async function unsubscriptionDo(feedId: FeedId, emailHash: string) {
      return post('/unsubscription', { id: si`${feedId.value}-${emailHash}` });
    }

    function getFeedSubscriberEmails(feedId: FeedId) {
      return loadJSON(makePath(getFeedStorageKey(feedId), 'emails.json'));
    }
  }).timeout(5000);

  describe('http session test', () => {
    it('works', async () => {
      const { responseBody, responseHeaders } = await get('/session-test', 'json');
      expect(responseBody.kind).to.equal('Success');

      const sessionId = (responseBody as Success).responseData!['sessionId'];
      expect(sessionId).to.exist;

      const sessionData = getSessionData(sessionId!);
      expect(sessionData['works']).to.equal(true);

      const cookie = responseHeaders.get('set-cookie')!;
      const { responseBody: subsequentRequestResponse } = await get('/session-test', 'json', new Headers({ cookie }));

      const subsequentRequestSession = (subsequentRequestResponse as Success).responseData!['sessionId'];
      expect(subsequentRequestSession).to.equal(sessionId);
    });
  });

  describe('web-ui-scripts', () => {
    it('are served', async () => {
      const { responseBody } = await get('/web-ui-scripts/web-ui/unsubscription-confirmation.js', 'text');
      const expectedFileSize = 3217;

      expect(responseBody.length).to.equal(expectedFileSize);
    });
  });

  describe('CORP policy', () => {
    it('allows embedding JS', async () => {
      const { responseHeaders } = await get('/web-ui-scripts/web-ui/subscription-form.js', 'text');

      expect(responseHeaders.get('cross-origin-resource-policy')).to.equal('cross-origin');
    });
  });

  describe('CORS policy', () => {
    it('is widely open', async () => {
      const { responseHeaders } = await get('/cors-test', 'text');

      expect(responseHeaders.get('access-control-allow-origin')).to.equal('*');
    });
  });

  describe('API code Git revisions', () => {
    it('is available', async () => {
      const { responseBody } = await get('/version.txt', 'text');
      const gitRevisionMask = /[a-f0-9]{40}\n/m;

      expect(responseBody).to.match(gitRevisionMask);
    });
  });

  describe('/feeds', () => {
    context('when not authenticated', () => {
      it('responds with 403 if not authenticated', async () => {
        const { responseBody } = await getUserFeeds(new Headers());

        expect(responseBody.message).to.equal('Not authenticated');
      });
    });

    context('when authenticated', () => {
      let authenticationHeaders: Headers;

      before(async () => {
        await registrationDo(userPlan, userEmail, userPassword);
        const { responseHeaders } = await registrationConfirmationDo(userEmail);
        const cookie = responseHeaders.get('set-cookie')!;

        authenticationHeaders = new Headers({ cookie });
      });

      describe('CRUD happy flow', () => {
        it('flows', async () => {
          // TODO:
          // - create
          // - list
          // - update
          // - delete
          const feedProps: MakeFeedInput = {
            displayName: 'API Test Feed Name',
            url: 'https://api-test.com/rss.xml',
            feedId: 'api-test-feed',
            replyTo: 'feed-replyto@api-test.com',
            schedule: '@hourly',
          };
          const { responseBody } = await createFeed(feedProps, authenticationHeaders);
          const storedFeed = getStoredFeedByEmailName(makeFeedId(feedProps.feedId) as FeedId);

          expect(responseBody).to.deep.equal({ kind: 'Success', message: 'Feed created' });

          expect(storedFeed.displayName).to.equal(feedProps.displayName);
          expect(storedFeed.url).to.equal(feedProps.url);
          expect(storedFeed.hashingSalt).to.match(/[0-9a-f]{16}/);
          expect(storedFeed.cronPattern).to.equal(cronPatternBySchedule[feedProps.schedule!]);
          expect(storedFeed.replyTo).to.equal(feedProps.replyTo);

          const { responseData: feeds } = (await getUserFeeds(authenticationHeaders)).responseBody as Success<Feed[]>;

          // TODO: This should fail
          expect(feeds).to.deep.equal([{}]);
        });

        function getStoredFeedByEmailName(feedId: FeedId) {
          return loadJSON(makePath(getFeedJsonStorageKey(feedId)));
        }
      });

      describe('failure paths', () => {
        // TODO

        it('POST returns a proper InputError', async () => {
          const invalidFeedProps = {};
          const responseBody = (await createFeed(invalidFeedProps, authenticationHeaders)).responseBody;

          expect(responseBody).to.deep.equal({
            kind: 'InputError',
            field: 'displayName',
            message: 'Invalid feed display name',
          });
        });
      });

      after(() => {
        deleteAccount(makeEmailAddress(userEmail) as EmailAddress);
      });
    });

    async function createFeed(feedProps: MakeFeedInput, authenticationHeaders: Headers) {
      const data = feedProps as Record<string, string>;

      return await post('/feeds', data, authenticationHeaders);
    }

    async function getUserFeeds(authenticationHeaders: Headers) {
      return await get<Feed[]>('/feeds', 'json', authenticationHeaders);
    }
  });

  async function authenticationDo(email: string, password: string) {
    return post('/authentication', { email, password });
  }

  async function registrationDo(plan: string, email: string, password: string) {
    return post('/registration', { plan, email, password });
  }

  async function registrationConfirmationDo(email: string) {
    const appSettings = loadJSON(makePath('settings.json')) as AppSettings;
    const secret = hash(email, `confirmation-secret-${appSettings.hashingSalt}`);

    return post('/registration-confirmation', { secret });
  }

  function getAccountByEmail(email: string): [AccountData, AccountId] {
    const hashingSalt = loadJSON(makePath(appSettingsStorageKey))['hashingSalt'];
    const accountId = getAccountIdByEmail(makeEmailAddress(email) as EmailAddress, hashingSalt);

    return [loadJSON(makePath(getAccountStorageKey(accountId))), accountId] as [AccountData, AccountId];
  }

  function getSessionData(sessionId: string) {
    return loadJSON(makePath('sessions', si`${sessionId}.json`));
  }

  interface ApiResponseTuple {
    responseHeaders: Headers;
  }

  interface TextApiResponse extends ApiResponseTuple {
    responseBody: string;
  }

  interface JsonApiResponse<D extends any = any> extends ApiResponseTuple {
    responseBody: ApiResponse<D>;
  }

  async function post(
    relativePath: string,
    data: Record<string, string> = {},
    headers: Headers = new Headers()
  ): Promise<JsonApiResponse> {
    const response = await fetch(makePath(apiBaseUrl, relativePath), {
      method: 'POST',
      body: new URLSearchParams(data),
      headers,
    });

    return {
      responseBody: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text(),
      responseHeaders: response.headers,
    };
  }

  async function get(path: string, type: 'text'): Promise<TextApiResponse>;
  async function get(path: string, type: 'text', headers: Headers): Promise<TextApiResponse>;
  async function get<D extends any = any>(path: string, type: 'json', headers: Headers): Promise<JsonApiResponse<D>>;
  async function get<D extends any = any>(path: string, type: 'json'): Promise<JsonApiResponse<D>>;
  async function get<D extends any = any>(path: string): Promise<JsonApiResponse<D>>;
  async function get<D extends any = any>(
    relativePath: string,
    type: 'json' | 'text' = 'json',
    headers?: Headers
  ): Promise<JsonApiResponse<D> | TextApiResponse> {
    const response = await fetch(makePath(apiBaseUrl, relativePath), { headers });

    return {
      responseBody: await response[type](),
      responseHeaders: response.headers,
    };
  }

  function loadJSON(filePath: string) {
    const jsonString = readFile(makePath(dataDirRoot, filePath));
    return JSON.parse(jsonString);
  }
});
