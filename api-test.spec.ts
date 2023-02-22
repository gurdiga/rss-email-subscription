import { expect } from 'chai';
import fetch, { Headers } from 'node-fetch';
import { deleteAccount } from './src/api/delete-account-cli';
import { AccountData, AccountId, isAccountId } from './src/domain/account';
import { getAccountIdByEmail } from './src/domain/account-crypto';
import { getAccountStorageKey } from './src/storage/account-storage';
import { AppSettings, appSettingsStorageKey } from './src/domain/app-settings';
import { AddNewFeedRequestData, AddNewFeedResponseData, EditFeedRequestData, FeedStatus } from './src/domain/feed';
import { EditFeedResponseData, Feed } from './src/domain/feed';
import { FeedId } from './src/domain/feed-id';
import { FeedStoredData, findFeedAccountId, getFeedJsonStorageKey } from './src/storage/feed-storage';
import { MakeFeedInput } from './src/domain/feed-making';
import { getFeedStorageKey } from './src/storage/feed-storage';
import { ApiResponse, InputError, makeInputError, Success } from './src/shared/api-response';
import { hash } from './src/shared/crypto';
import { readFile } from './src/storage/io-isolation';
import { si } from './src/shared/string-utils';
import { makePath } from './src/shared/path-utils';
import { die, makeTestStorage, makeTestFeedId, makeTestEmailAddress } from './src/shared/test-utils';
import { defaultFeedPattern } from './src/domain/cron-pattern';

describe('API', () => {
  let step = 0; // NOTE: test are expected to run in source order

  const dataDirRoot = process.env['DATA_DIR_ROOT'] || die('DATA_DIR_ROOT envar is missing');
  const domainName = 'localhost.feedsubscription.com';
  const apiOrigin = `https://${domainName}`;

  const userEmail = 'api-test-blogger@feedsubscription.com';
  const userPassword = 'A-long-S3cre7-password';
  const userPlan = 'standard';

  const testFeedProps: MakeFeedInput = {
    displayName: 'API Test Feed Name',
    url: 'https://api-test.com/rss.xml',
    id: 'api-test-feed',
    replyTo: 'feed-replyto@api-test.com',
  };

  const testFeedId = makeTestFeedId(testFeedProps.id);

  describe('infrastructure', () => {
    before(() => expect(++step).to.equal(1, 'test are expected to run in source order'));

    describe('http session test', () => {
      it('works', async () => {
        const { responseBody, responseHeaders } = await get('/api/session-test', 'json');
        expect(responseBody.kind).to.equal('Success');

        const sessionId = (responseBody as Success).responseData!['sessionId'];
        expect(sessionId).to.exist;

        const sessionData = loadSessionData(sessionId!);
        expect(sessionData['works']).to.equal(true);

        const cookie = responseHeaders.get('set-cookie')!;
        const { responseBody: subsequentRequestResponse } = await get(
          '/api/session-test',
          'json',
          new Headers({ cookie })
        );

        const subsequentRequestSession = (subsequentRequestResponse as Success).responseData!['sessionId'];
        expect(subsequentRequestSession).to.equal(sessionId);
      });
    });

    describe('web-ui-scripts', () => {
      it('are served', async () => {
        const sampleScript = '/web-ui-scripts/web-ui/unsubscription-confirmation.js';
        const { responseBody } = await get(sampleScript, 'text');

        expect(responseBody).to.equal(readFile(`website/html/${sampleScript}`));
      });
    });

    describe('CORP policy', () => {
      it('allows embedding JS', async () => {
        const subscriptionFormEmbedScript = '/web-ui-scripts/web-ui/subscription-form.js';
        const { responseHeaders } = await get(subscriptionFormEmbedScript, 'text');

        expect(responseHeaders.get('cross-origin-resource-policy')).to.equal('cross-origin');
      });
    });

    describe('CORS policy', () => {
      it('is widely open', async () => {
        const { responseHeaders } = await get('/api/cors-test', 'text');

        expect(responseHeaders.get('access-control-allow-origin')).to.equal('*');
      });
    });

    describe('API code Git revisions', () => {
      it('is available', async () => {
        const { responseBody } = await get('/api/version.txt', 'text');
        const gitRevisionMask = /[a-f0-9]{40}\n/m;

        expect(responseBody).to.match(gitRevisionMask);
      });
    });
  });

  describe('registration-confirmation-authentication-deauthentication flow', () => {
    before(() => expect(++step).to.equal(2, 'test are expected to run in source order'));

    it('flows', async () => {
      const { responseBody: registrationResponse } = await registrationSend(userPlan, userEmail, userPassword);
      const [account, accountId] = loadStoredAccountByEmail(userEmail);

      expect((registrationResponse as Success).kind).to.equal('Success', 'registration');
      expect(account.plan).to.equal(userPlan, 'registration plan');
      expect(account.email).to.equal(userEmail, 'registration email');
      expect(account.hashedPassword).to.be.a('string', 'registration hashedPassword');
      expect(account.creationTimestamp).to.be.a('string', 'registration creationTimestamp');
      expect(account.confirmationTimestamp, 'registration confirmationTimestamp').to.be.undefined;

      const { responseBody: repeatedRegistration } = await registrationSend(userPlan, userEmail, userPassword);
      expect(repeatedRegistration).to.deep.equal(makeInputError('Email already taken', 'email'));

      const { responseBody: registrationConfirmationResponse } = await registrationConfirmationSend(userEmail);
      expect(registrationConfirmationResponse).to.include(
        { kind: 'Success' },
        si`registration confirmation: ${JSON.stringify(registrationConfirmationResponse)}`
      );

      let sessionId = (registrationConfirmationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'registration confirmation response sessionId').to.exist;

      const sessionDataAfterConfirmation = loadSessionData(sessionId!);
      expect(sessionDataAfterConfirmation.accountId).to.equal(
        accountId.value,
        'registration confirmation session accountId'
      );

      const [accountAfterConfirmation] = loadStoredAccountByEmail(userEmail);
      expect(accountAfterConfirmation.confirmationTimestamp).to.be.a('string', 'confirmation timestamp');

      const { responseBody: authenticationResponse, responseHeaders } = await authenticationSend(
        userEmail,
        userPassword
      );
      expect(authenticationResponse.kind).to.equal(
        'Success',
        si`authentication: ${JSON.stringify(authenticationResponse)}`
      );

      sessionId = (authenticationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'authentication response sessionId').to.exist;

      const sessionData = loadSessionData(sessionId!);
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
      expect(deauthenticationResponse.kind).to.equal(
        'Success',
        si`deauthentication: ${JSON.stringify(deauthenticationResponse)}`
      );

      const sessionDataAfterDeauthentication = loadSessionData(sessionId!);
      expect(sessionDataAfterDeauthentication.accountId, 'deauthentication removes accountId from session').not.to
        .exist;
    }).timeout(5000);

    async function deauthenticationDo(responseHeaders: Headers) {
      const cookie = responseHeaders.get('set-cookie')!;
      const headers = new Headers({ cookie });
      const data = {};

      return post('/api/deauthentication', data, headers);
    }
  });

  describe('/api/feeds', () => {
    before(() => expect(++step).to.equal(3, 'test are expected to run in source order'));

    context('when authenticated', () => {
      let authenticationHeaders: Headers;

      before(async () => {
        const { responseBody, responseHeaders } = await authenticationSend(userEmail, userPassword);

        expect(responseBody.kind).to.equal('Success', 'authentication');
        authenticationHeaders = getAuthenticationHeaders(responseHeaders);
      });

      describe('CRUD happy path', () => {
        it('flows', async () => {
          const addNewFeedRequest: AddNewFeedRequestData = {
            displayName: testFeedProps.displayName!,
            url: testFeedProps.url!,
            id: testFeedProps.id!,
            replyTo: testFeedProps.replyTo!,
          };
          const { responseBody } = await addNewFeedSend(addNewFeedRequest, authenticationHeaders);

          const expectedAddFeedResponse: Success<AddNewFeedResponseData> = {
            kind: 'Success',
            message: 'New feed added. 👍',
            responseData: { feedId: addNewFeedRequest.id },
          };

          expect(responseBody).to.deep.equal(expectedAddFeedResponse);

          const storedFeed = loadStoredFeed(userEmail, testFeedId);

          expect(storedFeed.displayName).to.equal(testFeedProps.displayName);
          expect(storedFeed.url).to.equal(testFeedProps.url);
          expect(storedFeed.hashingSalt).to.match(/[0-9a-f]{16}/);
          expect(storedFeed.cronPattern).to.equal(defaultFeedPattern.value);
          expect(storedFeed.replyTo).to.equal(testFeedProps.replyTo);
          expect(storedFeed.isDeleted).to.equal(false);

          const loadFeedByIdResponse = await loadFeedByIdSend(testFeedId, authenticationHeaders);
          const { responseData: loadedFeed } = loadFeedByIdResponse.responseBody as Success<Feed>;

          expect(loadedFeed).to.deep.equal({
            id: 'api-test-feed',
            displayName: 'API Test Feed Name',
            url: 'https://api-test.com/rss.xml',
            email: 'api-test-feed@localhost.feedsubscription.com',
            replyTo: 'feed-replyto@api-test.com',
            subscriberCount: 0,
            status: FeedStatus.AwaitingReview,
          });

          const loadFeedsResponse = await loadFeedsSend(authenticationHeaders);
          const { responseData: loadedFeeds } = loadFeedsResponse.responseBody as Success<Feed[]>;

          expect(loadedFeeds).to.deep.equal([
            {
              displayName: testFeedProps.displayName,
              feedId: testFeedId,
            },
          ]);

          const repeadedAdd = await addNewFeedSend(addNewFeedRequest, authenticationHeaders);
          expect(repeadedAdd.responseBody).to.deep.equal(makeInputError('You already have a feed with this ID', 'id'));

          const displayNameUpdated = 'API Test Feed Name *Updated*';
          const initialSaltedHash = storedFeed.hashingSalt;
          const editFeedRequest: EditFeedRequestData = {
            ...addNewFeedRequest,
            initialId: testFeedId.value,
            id: 'new-feed-id',
            displayName: displayNameUpdated,
          };
          const editResponse = await editFeedSend(editFeedRequest, authenticationHeaders);

          const expectedEditFeedResponse: Success<EditFeedResponseData> = {
            kind: 'Success',
            message: 'Feed updated. 👍',
            responseData: { feedId: editFeedRequest.id },
          };
          expect(editResponse.responseBody).to.deep.equal(expectedEditFeedResponse);

          const newFeedId = makeTestFeedId(editFeedRequest.id);
          const editedFeed = loadStoredFeed(userEmail, newFeedId);
          expect(editedFeed.displayName).to.equal(displayNameUpdated);
          expect(editedFeed.hashingSalt).to.equal(initialSaltedHash, 'hashingSalt should not change on update');
          expect(editedFeed.isDeleted).be.false;

          const { responseBody: deleteResponse } = await deleteFeedSend(newFeedId, authenticationHeaders);
          expect(deleteResponse).to.deep.equal({ kind: 'Success', message: 'Feed deleted' });

          const deletedFeed = loadStoredFeed(userEmail, newFeedId);
          expect(deletedFeed.isDeleted).be.true;

          const finalFeedList = await loadFeedsSend(authenticationHeaders);
          const { responseData: feedsAfterDeletion } = finalFeedList.responseBody as Success<Feed[]>;
          expect(feedsAfterDeletion).to.deep.equal([]);
        });

        function loadStoredFeed(email: string, feedId: FeedId) {
          const [_, accountId] = loadStoredAccountByEmail(email);

          return loadJSON(getFeedJsonStorageKey(accountId, feedId)) as FeedStoredData;
        }
      });

      describe('failure paths', () => {
        it('/api/feeds/add-new-feed returns a proper InputError for proper AddNewFeedRequestData', async () => {
          const invalidRequest: AddNewFeedRequestData = {
            displayName: '', // Fields are empty
            url: '',
            id: '',
            replyTo: '',
          };
          const { responseBody } = await addNewFeedSend(invalidRequest, authenticationHeaders);

          expect(responseBody).to.deep.equal(makeInputError('Feed URL is missing', 'url'));
        });

        it('/api/feeds/edit-feed returns a proper InputError', async () => {
          const invalidRequest = { displayName: 'Something' } as EditFeedRequestData;
          const responseBody = (await editFeedSend(invalidRequest, authenticationHeaders)).responseBody;

          expect(responseBody).to.deep.equal(makeInputError('Feed URL is missing', 'url'));
        });
      });
    });

    context('when not authenticated', () => {
      it('responds with 403 if not authenticated', async () => {
        const { responseBody } = await loadFeedsSend(new Headers());

        expect(responseBody.message).to.equal('Not authenticated');
      });
    });

    async function loadFeedByIdSend(feedId: FeedId, authenticationHeaders: Headers) {
      return await get<Feed>(`/api/feeds/${feedId.value}`, 'json', authenticationHeaders);
    }

    async function loadFeedsSend(authenticationHeaders: Headers) {
      return await get<Feed[]>('/api/feeds', 'json', authenticationHeaders);
    }
  });

  describe('subscription-confirmation-unsubscription flow', () => {
    before(() => expect(++step).to.equal(4, 'test are expected to run in source order'));

    const subscriberEmail = 'api-test@feedsubscription.com';
    const storage = makeTestStorage({}, dataDirRoot);
    let emailHash: string;

    beforeEach(async () => {
      const authenticationResponse = await authenticationSend(userEmail, userPassword);

      expect(authenticationResponse.responseBody.kind).to.equal('Success', 'authentication');
      const authenticationHeaders = getAuthenticationHeaders(authenticationResponse.responseHeaders);

      const addNewFeedRequest: AddNewFeedRequestData = {
        displayName: testFeedProps.displayName!,
        url: testFeedProps.url!,
        id: testFeedProps.id!,
        replyTo: testFeedProps.replyTo!,
      };
      const addNewFeedResponse = await addNewFeedSend(addNewFeedRequest, authenticationHeaders);
      expect(addNewFeedResponse.responseBody.kind).to.equal('Success', 'addNewFeed');
    });

    it('flows', async () => {
      // ASSUMPTION: The feed testFeedId exists
      const { responseBody: subscriptionResult } = await subscriptionSend(testFeedId, subscriberEmail);
      expect(subscriptionResult).to.include(<Success>{ kind: 'Success' }, 'subscription result');

      const { responseBody: repeatedSubscriptionResult } = await subscriptionSend(testFeedId, subscriberEmail);
      expect(repeatedSubscriptionResult).to.deep.equal(
        <InputError>{ kind: 'InputError', message: 'Email is already subscribed' },
        'repeated subscription result'
      );

      const accountId = findFeedAccountId(testFeedId, storage) as AccountId;
      expect(isAccountId(accountId), 'feed account not found').to.be.true;

      const emails = loadStoredFeedSubscriberEmails(accountId, testFeedId);
      const storedEmail = Object.entries(emails).find(
        ([_, data]: [string, any]) => data.emailAddress === subscriberEmail
      )!;

      expect(storedEmail, 'stored email').to.exist;

      emailHash = storedEmail[0];

      expect(emails[emailHash].isConfirmed).to.be.false;

      const { responseBody: confirmationResult } = await subscriptionConfirmationSend(testFeedId, emailHash);
      expect(confirmationResult.kind).to.equal('Success');

      const emailAfterConfirmation = loadStoredFeedSubscriberEmails(accountId, testFeedId);
      expect(emailAfterConfirmation[emailHash].isConfirmed).to.be.true;

      const { responseBody: unsubscriptionResult } = await unsubscriptionSend(testFeedId, emailHash);

      expect(unsubscriptionResult.kind).to.equal('Success', 'unsubscription result');
      expect(loadStoredFeedSubscriberEmails(accountId, testFeedId), 'email removed from feed').not.to.include.keys(
        emailHash
      );

      const { responseBody: repeatedUnsubscriptionResult } = await unsubscriptionSend(testFeedId, emailHash);

      expect(repeatedUnsubscriptionResult).to.deep.equal(
        <Success>{ kind: 'Success', message: 'Solidly unsubscribed.' },
        'repeated unsubscription'
      );
    });

    after(async () => {
      await unsubscriptionSend(testFeedId, emailHash);
    });

    async function subscriptionSend(feedId: FeedId, email: string) {
      return post('/api/subscription', { feedId: feedId.value, email });
    }

    async function subscriptionConfirmationSend(feedId: FeedId, emailHash: string) {
      return post('/api/subscription-confirmation', { id: si`${feedId.value}-${emailHash}` });
    }

    async function unsubscriptionSend(feedId: FeedId, emailHash: string) {
      return post('/api/unsubscription', { id: si`${feedId.value}-${emailHash}` });
    }

    function loadStoredFeedSubscriberEmails(accountId: AccountId, feedId: FeedId) {
      return loadJSON(makePath(getFeedStorageKey(accountId, feedId), 'emails.json'));
    }
  }).timeout(5000);

  after(() => {
    deleteAccount(makeTestEmailAddress(userEmail));
  });

  async function addNewFeedSend(request: AddNewFeedRequestData, authenticationHeaders: Headers) {
    const data = request as Record<string, string>;

    return await post('/api/feeds/add-new-feed', data, authenticationHeaders);
  }

  async function editFeedSend(request: EditFeedRequestData, authenticationHeaders: Headers) {
    const data = request as Record<string, string>;

    return await post('/api/feeds/edit-feed', data, authenticationHeaders);
  }

  async function deleteFeedSend(feedId: FeedId, authenticationHeaders: Headers) {
    const path = makePath('/api/feeds', feedId.value);

    return await delete_(path, authenticationHeaders);
  }

  async function authenticationSend(email: string, password: string) {
    return post('/api/authentication', { email, password });
  }

  function getAuthenticationHeaders(responseHeaders: Headers): Headers {
    const cookie = responseHeaders.get('set-cookie')!;

    return new Headers({ cookie });
  }

  async function registrationSend(plan: string, email: string, password: string) {
    return post('/api/registration', { plan, email, password });
  }

  async function registrationConfirmationSend(email: string) {
    const appSettings = loadJSON(makePath('settings.json')) as AppSettings;
    const secret = hash(email, `confirmation-secret-${appSettings.hashingSalt}`);

    return post('/api/registration-confirmation', { secret });
  }

  function loadStoredAccountByEmail(email: string): [AccountData, AccountId] {
    const hashingSalt = loadJSON(makePath(appSettingsStorageKey))['hashingSalt'];
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

    return [loadJSON(makePath(getAccountStorageKey(accountId))), accountId] as [AccountData, AccountId];
  }

  function loadSessionData(sessionId: string) {
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
    headers: Headers = new Headers(),
    method: 'POST' | 'PUT' = 'POST'
  ): Promise<JsonApiResponse> {
    const response = await fetch(makePath(apiOrigin, relativePath), {
      method,
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

  async function delete_(relativePath: string, headers: Headers = new Headers()): Promise<TextApiResponse> {
    const response = await fetch(makePath(apiOrigin, relativePath), { method: 'DELETE', headers });

    return {
      responseBody: await response.json(),
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
    const response = await fetch(makePath(apiOrigin, relativePath), { headers });

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
