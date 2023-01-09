import { expect } from 'chai';
import fetch, { Headers } from 'node-fetch';
import { deleteAccount } from './src/api/delete-account-cli';
import { AccountData, AccountId, getAccountIdByEmail, getAccountStorageKey, isAccountId } from './src/domain/account';
import { AppSettings, appSettingsStorageKey } from './src/domain/app-settings';
import { Feed, FeedId, FeedStoredData, findAccountId, getFeedJsonStorageKey } from './src/domain/feed';
import { getFeedStorageKey, MakeFeedInput } from './src/domain/feed';
import { ApiResponse, makeInputError, Success } from './src/shared/api-response';
import { hash } from './src/shared/crypto';
import { readFile } from './src/shared/io-isolation';
import { si } from './src/shared/string-utils';
import { makePath } from './src/shared/path-utils';
import { die, makeTestStorage, makeTestFeedId, makeTestEmailAddress } from './src/shared/test-utils';
import { makeUnixCronPattern, UnixCronPattern } from './src/domain/cron-pattern';

describe('API', () => {
  let step = 0; // NOTE: test are expected to run in source order

  const dataDirRoot = process.env['DATA_DIR_ROOT'] || die('DATA_DIR_ROOT envar is missing');
  const domainName = 'localhost.feedsubscription.com';
  const apiBaseUrl = `https://${domainName}/api`;

  const userEmail = 'api-test-blogger@feedsubscription.com';
  const userPassword = 'A-long-S3cre7-password';
  const userPlan = 'standard';
  const cronPattern = makeUnixCronPattern('@hourly') as UnixCronPattern;

  const testFeedProps: MakeFeedInput = {
    displayName: 'API Test Feed Name',
    url: 'https://api-test.com/rss.xml',
    feedId: 'api-test-feed',
    replyTo: 'feed-replyto@api-test.com',
    cronPattern: cronPattern.value,
  };

  const testFeedId = makeTestFeedId(testFeedProps.feedId);

  describe('infrastructure', () => {
    before(() => expect(++step).to.equal(1, 'test are expected to run in source order'));

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
  });

  describe('registration-confirmation-authentication-deauthentication flow', () => {
    before(() => expect(++step).to.equal(2, 'test are expected to run in source order'));

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
      expect(repeatedRegistration).to.deep.equal(makeInputError('Email already taken', 'email'));

      const { responseBody: registrationConfirmationResponse } = await registrationConfirmationDo(userEmail);
      expect(registrationConfirmationResponse).to.include({ kind: 'Success' }, 'registration confirmation');

      let sessionId = (registrationConfirmationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'registration confirmation response sessionId').to.exist;

      const sessionDataAfterConfirmation = getSessionData(sessionId!);
      expect(sessionDataAfterConfirmation.accountId).to.equal(
        accountId.value,
        'registration confirmation session accountId'
      );

      const [accountAfterConfirmation] = getAccountByEmail(userEmail);
      expect(accountAfterConfirmation.confirmationTimestamp).to.be.a('string', 'confirmation timestamp');

      const { responseBody: authenticationResponse, responseHeaders } = await authenticationDo(userEmail, userPassword);
      expect(authenticationResponse.kind).to.equal('Success', 'authentication');

      sessionId = (authenticationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'authentication response sessionId').to.exist;

      const sessionData = getSessionData(sessionId!);
      const sessionCookie = sessionData.cookie!;

      expect(sessionData.accountId).to.equal(accountId.value, 'authentication session accountId');
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

    async function deauthenticationDo(responseHeaders: Headers) {
      const cookie = responseHeaders.get('set-cookie')!;
      const headers = new Headers({ cookie });
      const data = {};

      return post('/deauthentication', data, headers);
    }
  });

  describe('/feeds', () => {
    before(() => expect(++step).to.equal(3, 'test are expected to run in source order'));

    context('when authenticated', () => {
      let authenticationHeaders: Headers;

      before(async () => {
        const { responseBody, responseHeaders } = await authenticationDo(userEmail, userPassword);

        expect(responseBody.kind).to.equal('Success', 'authentication');
        authenticationHeaders = getAuthenticationHeaders(responseHeaders);
      });

      describe('CRUD happy flow', () => {
        it('flows', async () => {
          // TODO:
          // - create
          // - list
          // - update
          // - delete
          const { responseBody } = await createFeed(testFeedProps, authenticationHeaders);
          const storedFeed = getStoredFeed(userEmail, testFeedId);

          expect(responseBody).to.deep.equal({ kind: 'Success', message: 'Feed created' });

          expect(storedFeed.displayName).to.equal(testFeedProps.displayName);
          expect(storedFeed.url).to.equal(testFeedProps.url);
          expect(storedFeed.hashingSalt).to.match(/[0-9a-f]{16}/);
          expect(storedFeed.cronPattern).to.equal(cronPattern.value);
          expect(storedFeed.replyTo).to.equal(testFeedProps.replyTo);

          const { responseData: feeds } = (await getUserFeeds(authenticationHeaders)).responseBody as Success<Feed[]>;
          const loadedFeed = feeds![0]!;

          expect(feeds).to.have.lengthOf(1);
          expect(loadedFeed).to.deep.include({
            kind: 'Feed',
            id: testFeedId,
            displayName: testFeedProps.displayName,
            url: testFeedProps.url,
            replyTo: makeTestEmailAddress(testFeedProps.replyTo!),
            cronPattern,
          });
          expect(loadedFeed.hashingSalt).to.match(/[0-9a-f]{16}/);

          const { responseBody: repeadedRequestResponseBody } = await createFeed(testFeedProps, authenticationHeaders);
          expect(repeadedRequestResponseBody).to.deep.equal(makeInputError('Feed ID taken'));
        });

        function getStoredFeed(email: string, feedId: FeedId) {
          const [_, accountId] = getAccountByEmail(email);

          return loadJSON(getFeedJsonStorageKey(accountId, feedId)) as FeedStoredData;
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
            message: 'Invalid feed display name: "undefined"',
          });
        });
      });
    });

    context('when not authenticated', () => {
      it('responds with 403 if not authenticated', async () => {
        const { responseBody } = await getUserFeeds(new Headers());

        expect(responseBody.message).to.equal('Not authenticated');
      });
    });

    async function getUserFeeds(authenticationHeaders: Headers) {
      return await get<Feed[]>('/feeds', 'json', authenticationHeaders);
    }
  });

  describe('subscription-confirmation-unsubscription flow', () => {
    before(() => expect(++step).to.equal(4, 'test are expected to run in source order'));

    const subscriberEmail = 'api-test@feedsubscription.com';
    const storage = makeTestStorage({}, dataDirRoot);
    let emailHash: string;

    it('flows', async () => {
      // ASSUMPTION: The feed testFeedId exists
      const { responseBody: subscriptionResult } = await subscriptionDo(testFeedId, subscriberEmail);
      expect(subscriptionResult).to.include({ kind: 'Success' }, 'subscription result');

      const { responseBody: repeatedSubscriptionResult } = await subscriptionDo(testFeedId, subscriberEmail);
      expect(repeatedSubscriptionResult).to.deep.equal(
        { kind: 'InputError', message: 'Email is already subscribed' },
        'repeated subscription result'
      );

      const accountId = findAccountId(testFeedId, storage) as AccountId;
      expect(isAccountId(accountId), 'feed account not found').to.be.true;

      const emails = getFeedSubscriberEmails(accountId, testFeedId);
      const storedEmail = Object.entries(emails).find(
        ([_, data]: [string, any]) => data.emailAddress === subscriberEmail
      )!;

      expect(storedEmail, 'stored email').to.exist;

      emailHash = storedEmail[0];

      expect(emails[emailHash].isConfirmed).to.be.false;

      const { responseBody: subscriptionConfirmationResult } = await subscriptionConfirmationDo(testFeedId, emailHash);
      expect(subscriptionConfirmationResult.kind).to.equal('Success');

      const emailAfterConfirmation = getFeedSubscriberEmails(accountId, testFeedId);
      expect(emailAfterConfirmation[emailHash].isConfirmed).to.be.true;

      const { responseBody: unsubscriptionResult } = await unsubscriptionDo(testFeedId, emailHash);

      expect(unsubscriptionResult.kind).to.equal('Success', 'unsubscription result');
      expect(getFeedSubscriberEmails(accountId, testFeedId), 'email removed from feed').not.to.include.keys(emailHash);

      const { responseBody: repeatedUnsubscriptionResult } = await unsubscriptionDo(testFeedId, emailHash);

      expect(repeatedUnsubscriptionResult).to.deep.equal(
        { kind: 'Success', message: 'Solidly unsubscribed.' },
        'repeated unsubscription'
      );
    });

    after(async () => {
      await unsubscriptionDo(testFeedId, emailHash);
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

    function getFeedSubscriberEmails(accountId: AccountId, feedId: FeedId) {
      return loadJSON(makePath(getFeedStorageKey(accountId, feedId), 'emails.json'));
    }
  }).timeout(5000);

  after(() => {
    deleteAccount(makeTestEmailAddress(userEmail));
  });

  async function createFeed(feedProps: MakeFeedInput, authenticationHeaders: Headers) {
    const data = feedProps as Record<string, string>;

    return await post('/feeds', data, authenticationHeaders);
  }

  async function authenticationDo(email: string, password: string) {
    return post('/authentication', { email, password });
  }

  function getAuthenticationHeaders(responseHeaders: Headers): Headers {
    const cookie = responseHeaders.get('set-cookie')!;

    return new Headers({ cookie });
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
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

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
