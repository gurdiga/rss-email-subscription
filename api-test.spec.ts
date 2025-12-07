import { expect } from 'chai';
const cookie = require('cookie');
import fetchCookie from 'fetch-cookie';
import { navbarCookieName } from './src/api/app-cookie';
import { deleteAccount } from './src/api/delete-account-cli';
import { sessionCookieMaxage } from './src/api/session';
import { getStripeCardDescriptionStorageKey } from './src/api/stripe-integration';
import { getEmailsStorageKey } from './src/app/email-sending/emails';
import {
  AccountData,
  AccountId,
  EmailChangeConfirmationRequestData,
  EmailChangeRequestData,
  isAccountId,
  PasswordChangeRequestData,
} from './src/domain/account';
import {
  getAccountIdByEmail,
  makeEmailChangeConfirmationSecretHash,
  makePasswordResetConfirmationSecretHash,
  makeRegistrationConfirmationSecretHash,
} from './src/domain/account-crypto';
import { getAccountStorageKey } from './src/domain/account-storage';
import { ApiPath, getFullApiPath } from './src/domain/api-path';
import { AppSettings, appSettingsStorageKey } from './src/domain/app-settings';
import { ConfirmationSecret, EmailChangeRequestSecretData } from './src/domain/confirmation-secrets';
import { getConfirmationSecretStorageKey } from './src/domain/confirmation-secrets-storage';
import { defaultFeedPattern } from './src/domain/cron-pattern';
import { domainAndLocalPart, EmailAddress } from './src/domain/email-address';
import {
  AddEmailsRequest,
  AddEmailsResponse,
  AddNewFeedRequestData,
  AddNewFeedResponseData,
  DeleteEmailsRequest,
  DeleteEmailsResponse,
  DeleteFeedRequestData,
  EditFeedRequestData,
  EditFeedResponse,
  Feed,
  FeedStatus,
  LoadEmailsResponse,
  LoadFeedsResponseData,
  makeFullItemTextString,
  makeItemTitleString,
} from './src/domain/feed';
import { FeedId } from './src/domain/feed-id';
import {
  FeedStoredData,
  findFeedAccountId,
  getFeedJsonStorageKey,
  getFeedRootStorageKey,
} from './src/domain/feed-storage';
import { deleteFile, fileExists, readFile, writeFile } from './src/domain/io-isolation';
import {
  PasswordResetConfirmationData,
  PasswordResetConfirmationSecretData,
  PasswordResetRequestData,
} from './src/domain/password-reset';
import { PlanId } from './src/domain/plan';
import { ApiResponse, InputError, makeInputError, Success } from './src/shared/api-response';
import { sortBy } from './src/shared/array-utils';
import { hash } from './src/shared/crypto';
import { isErr } from './src/shared/lang';
import { makePath } from './src/shared/path-utils';
import { si } from './src/shared/string-utils';
import {
  die,
  makeTestConfirmationSecret,
  makeTestEmailAddress,
  makeTestFeedId,
  makeTestStorage,
} from './src/shared/test-utils';

const fetch = fetchCookie(globalThis.fetch);

describe('API', () => {
  let step = 0; // NOTE: Test are expected to run in source order AND with the --bail option.

  const dataDirRoot = process.env['DATA_DIR_ROOT'] || die('DATA_DIR_ROOT envar is missing');
  const apiOrigin = `https://localhost.feedsubscription.com`;
  const appSettings = loadAppSettings();

  const userEmail = 'api-test-blogger@feedsubscription.com';
  const userPassword = 'A-long-S3cre7-password';
  const planId = PlanId.Mastery;

  const newUserEmail = 'api-test-new-email@feedsubscription.com';

  const testFeedProps = {
    displayName: 'API Test Feed Name',
    url: 'https://api-test.com/rss.xml',
    id: 'api-test-feed',
    replyTo: 'feed-replyto@api-test.com',
    emailBodySpec: makeFullItemTextString(),
    emailSubjectSpec: makeItemTitleString(),
  };

  const testFeedId = makeTestFeedId(testFeedProps.id);

  describe('infrastructure', () => {
    before(() => expect(++step).to.equal(1, 'test are expected to run in source order'));

    describe('http session test', () => {
      it('works', async () => {
        const { responseBody } = await get(getFullApiPath(ApiPath.sessionTest), 'json');
        expect(responseBody.kind).to.equal('Success');

        const sessionId = (responseBody as Success).responseData!['sessionId'];
        expect(sessionId).to.exist;

        const sessionData = loadSessionData(sessionId);
        expect(sessionData['works']).to.equal(true);

        const { responseBody: subsequentRequestResponse } = await get(getFullApiPath(ApiPath.sessionTest), 'json');
        const subsequentRequestSession = (subsequentRequestResponse as Success).responseData!['sessionId'];
        expect(subsequentRequestSession).to.equal(sessionId);
      });
    });

    describe('web-ui-scripts', () => {
      it('are served', async () => {
        const sampleScript = si`${ApiPath.webUiScripts}/web-ui/unsubscription-confirmation.js`;
        const { responseBody } = await get(sampleScript, 'text');

        expect(responseBody).to.equal(readFile(`website/html/${sampleScript}`));
      });
    });

    describe('CORP policy', () => {
      it('allows embedding JS', async () => {
        const subscriptionFormEmbedScript = `${ApiPath.webUiScripts}/web-ui/subscription-form.js`;
        const { responseHeaders } = await get(subscriptionFormEmbedScript, 'text');

        expect(responseHeaders.get('cross-origin-resource-policy')).to.equal('cross-origin');
      });
    });

    describe('CORS policy', () => {
      it('is widely open', async () => {
        const { responseHeaders } = await get(getFullApiPath(ApiPath.corsTest), 'text');

        expect(responseHeaders.get('access-control-allow-origin')).to.equal('*');
      });
    });

    describe('API code Git revisions', () => {
      it('is available', async () => {
        const { responseBody } = await get(getFullApiPath(ApiPath.versionTxt), 'text');
        const gitRevisionMask = /[a-f0-9]{40}\n/m;

        expect(responseBody).to.match(gitRevisionMask);
      });
    });

    describe('short Subscribe Link redirects', () => {
      const feedId = 'feed-id';
      const shortUrl = si`${apiOrigin}/to/${feedId}`;
      const longUrl = si`${apiOrigin}/subscription-request.html?feedId=${feedId}`;

      it('redirects /to/FEED_ID to /subscription-request.html?feedId=FEED_ID', async () => {
        const response = await fetch(shortUrl, { redirect: 'manual' });

        expect(response.status).to.equal(302);
        expect(response.headers.get('location')).to.equal(longUrl);
      });
    });
  });

  describe('registration-confirmation-authentication-deauthentication flow', () => {
    before(() => expect(++step).to.equal(2, 'test are expected to run in source order'));

    it('flows', async () => {
      const { responseBody: registrationResponse } = await registrationSend(planId, userEmail, userPassword);
      const [account, accountId] = loadStoredAccountByEmail(userEmail);

      expect((registrationResponse as Success).kind).to.equal('Success', 'registration');
      expect(account.planId).to.equal(planId, 'registration email');
      expect(account.email).to.equal(userEmail, 'registration email');
      expect(account.hashedPassword).to.be.a('string', 'registration hashedPassword');
      expect(account.creationTimestamp).to.be.a('string', 'registration creationTimestamp');
      expect(account.confirmationTimestamp, 'registration confirmationTimestamp').to.be.undefined;

      const { responseBody: repeatedRegistration } = await registrationSend(planId, userEmail, userPassword);
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
      expect(sessionDataAfterConfirmation.email).to.equal(userEmail, 'registration confirmation session email');

      const [accountAfterConfirmation] = loadStoredAccountByEmail(userEmail);
      expect(accountAfterConfirmation.confirmationTimestamp).to.be.a('string', 'confirmation timestamp');

      const { responseBody: authenticationResponse, responseHeaders: authenticationResponseHeaders } =
        await authenticationSend(userEmail, userPassword);
      expect(authenticationResponse.kind).to.equal(
        'Success',
        si`authentication: ${JSON.stringify(authenticationResponse)}`
      );

      let navbarCookie = getCookie(authenticationResponseHeaders, navbarCookieName);
      expect(navbarCookie).to.include({ [navbarCookieName]: 'true' }, 'sets the navbar cookie');

      sessionId = (authenticationResponse as Success).responseData!['sessionId'];
      expect(sessionId, 'authentication response sessionId').to.exist;

      const sessionData = loadSessionData(sessionId!);
      const sessionCookie = sessionData.cookie!;

      expect(sessionData.accountId).to.equal(accountId.value, 'authentication session accountId');
      expect(sessionData.email).to.equal(userEmail, 'authentication session email');
      expect(sessionCookie.originalMaxAge).to.equal(sessionCookieMaxage, 'authentication cookie maxAge');
      expect(sessionCookie.sameSite).to.equal('strict', 'authentication cookie sameSite');
      expect(sessionCookie.httpOnly).to.equal(true, 'authentication cookie httpOnly');

      expect(new Date(sessionCookie.expires)).is.greaterThan(
        new Date(sessionDataAfterConfirmation.cookie!.expires),
        'authentication session is rolling'
      );

      const { responseBody: deauthenticationResponseBody, responseHeaders: deauthenticationResponseHeaders } =
        await deauthenticationSend();
      expect(deauthenticationResponseBody.kind).to.equal(
        'Success',
        si`deauthentication response: ${JSON.stringify(deauthenticationResponseBody)}`
      );

      navbarCookie = getCookie(deauthenticationResponseHeaders, navbarCookieName);
      expect(navbarCookie).to.include({ [navbarCookieName]: 'false' }, 'unsets the navbar cookie');

      const sessionDataAfterDeauthentication = loadSessionData(sessionId);
      expect(sessionDataAfterDeauthentication.accountId, 'deauthentication removes accountId from session').not.to
        .exist;
    }).timeout(5000);
  });

  describe('/api/feeds', () => {
    before(() => expect(++step).to.equal(3, 'test are expected to run in source order'));

    context('when authenticated', () => {
      before(authenticate);

      describe('CRUD happy path', () => {
        it('flows', async () => {
          const addNewFeedRequest: AddNewFeedRequestData = {
            displayName: testFeedProps.displayName,
            url: testFeedProps.url,
            id: testFeedProps.id,
            replyTo: testFeedProps.replyTo,
            emailBodySpec: testFeedProps.emailBodySpec,
            emailSubjectSpec: testFeedProps.emailSubjectSpec,
          };
          const { responseBody } = await addNewFeedSend(addNewFeedRequest);

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
          expect(storedFeed.emailBodySpec).to.equal(testFeedProps.emailBodySpec);

          const loadFeedByIdResponse = await loadFeedByIdSend(testFeedId);
          const { responseData: loadedFeed } = loadFeedByIdResponse.responseBody as Success<Feed>;

          expect(loadedFeed).to.deep.equal({
            id: 'api-test-feed',
            displayName: 'API Test Feed Name',
            url: 'https://api-test.com/rss.xml',
            email: 'api-test-feed@localhost.feedsubscription.com',
            emailBodySpec: 'full-item-text',
            emailSubjectSpec: 'item-title',
            replyTo: 'feed-replyto@api-test.com',
            status: FeedStatus.AwaitingReview,
          });

          const subscribers = loadStoredFeedSubscribers(userEmail, testFeedId);

          expect(subscribers).to.deep.equal([userEmail]);

          const loadFeedsResponse = await loadFeedsSend();
          const { responseData: loadedFeeds } = loadFeedsResponse.responseBody as Success<LoadFeedsResponseData>;

          expect(loadedFeeds).to.deep.equal([
            {
              displayName: testFeedProps.displayName,
              feedId: testFeedId,
            },
          ]);

          const repeadedAdd = await addNewFeedSend(addNewFeedRequest);
          expect(repeadedAdd.responseBody).to.deep.equal(makeInputError('You already have a feed with this ID', 'id'));

          const displayNameUpdated = 'API Test Feed Name *Updated*';
          const initialSaltedHash = storedFeed.hashingSalt;
          const editFeedRequest: EditFeedRequestData = {
            ...addNewFeedRequest,
            initialId: testFeedId.value,
            id: 'new-feed-id',
            displayName: displayNameUpdated,
          };
          const editResponse = await editFeedSend(editFeedRequest);

          const expectedEditFeedResponse: Success<EditFeedResponse> = {
            kind: 'Success',
            message: 'Feed updated. 👍',
            responseData: { feedId: editFeedRequest.id },
          };
          expect(editResponse.responseBody).to.deep.equal(expectedEditFeedResponse);

          const newFeedId = makeTestFeedId(editFeedRequest.id);
          const editedFeed = loadStoredFeed(userEmail, newFeedId);
          expect(editedFeed.displayName).to.equal(displayNameUpdated);
          expect(editedFeed.hashingSalt).to.equal(initialSaltedHash, 'hashingSalt should not change on update');

          let expectedResponse: Success<LoadEmailsResponse> = {
            kind: 'Success',
            message: 'Feed subscribers',
            responseData: { displayName: displayNameUpdated, emails: [userEmail] },
          };
          let { responseBody: loadEmailsResponse } = await loadEmailsSend(newFeedId);
          expect(loadEmailsResponse).to.deep.equal(expectedResponse);

          const emailsToAdd = ['one@api-test.com', 'two@api-test.com', 'three@api-test.com'];
          const addEmailsRequest: AddEmailsRequest = {
            feedId: newFeedId.value,
            emailsOnePerLine: emailsToAdd.join('\n'),
          };
          let { responseBody: addEmailsResponse } = await addEmailsSend(addEmailsRequest);
          const expectedAddEmailsResponse: Success<AddEmailsResponse> = {
            kind: 'Success',
            message: 'Added 3 subscribers',
            responseData: {
              currentEmails: [userEmail, ...emailsToAdd].sort(sortBy(domainAndLocalPart)),
              newEmailsCount: emailsToAdd.length,
            },
          };
          expect(addEmailsResponse).to.deep.equal(expectedAddEmailsResponse);

          const deleteEmailsRequest: DeleteEmailsRequest = {
            feedId: newFeedId.value,
            emailsToDeleteOnePerLine: emailsToAdd[1]!,
          };
          let { responseBody: deleteEmailsResponse } = await deleteEmailsSend(deleteEmailsRequest);
          const expectedDeleteEmailsResponse: Success<DeleteEmailsResponse> = {
            kind: 'Success',
            message: 'Deleted subscribers',
            responseData: { currentEmails: [emailsToAdd[0]!, emailsToAdd[2]!, userEmail] },
          };
          expect(deleteEmailsResponse).to.deep.equal(expectedDeleteEmailsResponse);

          const { responseBody: deleteResponse } = await deleteFeedSend(newFeedId);
          expect(deleteResponse).to.deep.equal({ kind: 'Success', message: 'Feed deleted' });

          const feedExists = storedFeedExists(userEmail, newFeedId);
          expect(feedExists).be.false;

          const finalFeedList = await loadFeedsSend();
          const { responseData: feedsAfterDeletion } = finalFeedList.responseBody as Success<LoadFeedsResponseData>;
          expect(feedsAfterDeletion).to.not.include(newFeedId);
        });

        function loadStoredFeed(email: string, feedId: FeedId) {
          const accountId = getAccountId(email);

          return loadJSON(getFeedJsonStorageKey(accountId, feedId)) as FeedStoredData;
        }

        function loadStoredFeedSubscribers(email: string, feedId: FeedId) {
          const accountId = getAccountId(email);
          const storageKey = getEmailsStorageKey(accountId, feedId);

          const json = loadJSON(storageKey);

          return Object.values(json).map((x: any) => x.emailAddress);
        }

        function storedFeedExists(email: string, feedId: FeedId) {
          const accountId = getAccountId(email);

          return fileExists(makePath(dataDirRoot, getFeedRootStorageKey(accountId, feedId)));
        }
      });

      describe('failure paths', () => {
        it(si`${ApiPath.addNewFeed} returns a proper InputError for proper AddNewFeedRequestData`, async () => {
          const invalidRequest: AddNewFeedRequestData = {
            displayName: '', // Fields are empty
            url: '',
            id: '',
            replyTo: '',
            emailBodySpec: '',
            emailSubjectSpec: '',
          };
          const { responseBody } = await addNewFeedSend(invalidRequest);

          expect(responseBody).to.deep.equal(makeInputError('Missing value', 'url'));
        });

        it(si`${ApiPath.editFeed} returns a proper InputError`, async () => {
          const invalidRequest = { displayName: 'Something' } as EditFeedRequestData;
          const responseBody = (await editFeedSend(invalidRequest)).responseBody;

          expect(responseBody).to.deep.equal(makeInputError('Missing value', 'url'));
        });

        describe('when feed ID is taken', () => {
          describe('by another feed of mine', () => {
            beforeEach(async () => {
              const addExistingFeed = await addNewFeedSend({
                displayName: 'Another test feed',
                url: 'https://test.com/existing-feed/rss',
                id: 'existing-feed',
                replyTo: 'reply-to-existing-feed@test.com',
                emailBodySpec: makeFullItemTextString(),
                emailSubjectSpec: makeItemTitleString(),
              });
              expect(addExistingFeed.responseBody.kind).to.equal('Success');

              const response = await addNewFeedSend({
                displayName: 'Feed to edit',
                url: 'https://test.com/feed-to-edit/rss',
                id: 'feed-to-edit',
                replyTo: 'reply-to-feed-to-edit@test.com',
                emailBodySpec: makeFullItemTextString(),
                emailSubjectSpec: makeItemTitleString(),
              });
              expect(response.responseBody.kind).to.equal('Success');
            });

            it('refuses request', async () => {
              const editFeedRequest: EditFeedRequestData = {
                displayName: 'Feed to edit',
                url: 'https://test.com/feed-to-edit/rss',
                replyTo: 'reply-to-feed-to-edit@test.com',
                emailBodySpec: makeFullItemTextString(),
                emailSubjectSpec: makeItemTitleString(),
                initialId: 'feed-to-edit',
                id: 'existing-feed',
              };

              const failedEditResponse = await editFeedSend(editFeedRequest);
              const expectedFailedEditFeedResponse: InputError = {
                field: 'id',
                kind: 'InputError',
                message: 'You already have a feed with this ID',
              };
              expect(failedEditResponse.responseBody).to.deep.equal(expectedFailedEditFeedResponse);
            });
          });

          describe('by someone-else’s feed', () => {
            // Not testing because it’s too complex
          });
        });
      });
    });

    context('when not authenticated', () => {
      it('responds with 403 if not authenticated', async () => {
        await deauthenticationSend();
        const { responseBody } = await loadFeedsSend();

        expect(responseBody.message).to.equal('Not authenticated');
      });
    });

    async function loadEmailsSend(feedId: FeedId) {
      const path = getFullApiPath(ApiPath.loadFeedSubscribers, { feedId: feedId.value });
      return await get<LoadEmailsResponse>(path, 'json');
    }

    async function addEmailsSend(request: AddEmailsRequest) {
      const path = getFullApiPath(ApiPath.addFeedSubscribers);
      return await post(path, request);
    }

    async function deleteEmailsSend(request: DeleteEmailsRequest) {
      const path = getFullApiPath(ApiPath.deleteFeedSubscribers);
      return await post(path, request);
    }

    async function loadFeedByIdSend(feedId: FeedId) {
      const path = getFullApiPath(ApiPath.loadFeedById, { feedId: feedId.value });
      return await get<Feed>(path, 'json');
    }

    async function loadFeedsSend() {
      return await get<Feed[]>(getFullApiPath(ApiPath.loadFeeds), 'json');
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

      const addNewFeedRequest: AddNewFeedRequestData = {
        displayName: testFeedProps.displayName!,
        url: testFeedProps.url!,
        id: testFeedProps.id!,
        replyTo: testFeedProps.replyTo!,
        emailBodySpec: makeFullItemTextString(),
        emailSubjectSpec: makeItemTitleString(),
      };
      const addNewFeedResponse = await addNewFeedSend(addNewFeedRequest);
      expect(addNewFeedResponse.responseBody.kind).to.equal('Success', 'addNewFeed');
    });

    it('flows', async () => {
      const { responseBody: subscriptionResult } = await subscriptionSend(testFeedId, subscriberEmail);
      expect(subscriptionResult.kind).to.equal(
        'Success',
        si`subscription result: ${JSON.stringify(subscriptionResult)}`
      );

      const { responseBody: repeatedSubscriptionResult } = await subscriptionSend(testFeedId, subscriberEmail);
      expect(repeatedSubscriptionResult).to.deep.equal(
        <Success>{ kind: 'Success', message: 'This email is already subscribed! 👍' },
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
      const expectedResponse: Success = { kind: 'Success', message: 'Solidly unsubscribed.' };
      expect(repeatedUnsubscriptionResult).to.deep.equal(expectedResponse, 'repeated unsubscription');
    });

    after(async () => {
      await unsubscriptionSend(testFeedId, emailHash);
    });

    async function subscriptionSend(feedId: FeedId, email: string) {
      return post(getFullApiPath(ApiPath.subscription), { feedId: feedId.value, email });
    }

    async function subscriptionConfirmationSend(feedId: FeedId, emailHash: string) {
      return post(getFullApiPath(ApiPath.subscriptionConfirmation), { id: si`${feedId.value}-${emailHash}` });
    }

    async function unsubscriptionSend(feedId: FeedId, emailHash: string) {
      return post(getFullApiPath(ApiPath.unsubscription), { id: si`${feedId.value}-${emailHash}` });
    }

    function loadStoredFeedSubscriberEmails(accountId: AccountId, feedId: FeedId) {
      return loadJSON(makePath(getFeedRootStorageKey(accountId, feedId), 'emails.json'));
    }
  }).timeout(5000);

  describe('Account page endpoints', () => {
    before(() => expect(++step).to.equal(5, 'test are expected to run in source order'));

    describe('Load account info', () => {
      before(authenticate);

      const cardDescription = 'Api-Test-AMEX ••••4567 expiring in December 2020';
      const accountId = getAccountIdByEmail(makeTestEmailAddress(userEmail), appSettings.hashingSalt);

      before(() => storeCardDescription(accountId));
      after(() => removeCardDescription(accountId));

      it('loads the account information for the authenticated user', async () => {
        const { responseBody } = await loadCurrentAccountSend();

        expect(responseBody).to.deep.equal(<Success>{
          kind: 'Success',
          message: 'Success',
          responseData: {
            email: 'api-test-blogger@feedsubscription.com',
            planId,
            cardDescription,
            isAdmin: false,
          },
        });
      });

      function storeCardDescription(accountId: AccountId): void {
        const filePath = getStripeCardDescriptionStorageKey(accountId);

        writeFile(makePath(dataDirRoot, filePath), JSON.stringify(cardDescription));
      }

      function removeCardDescription(accountId: AccountId): void {
        const filePath = getStripeCardDescriptionStorageKey(accountId);

        deleteFile(makePath(dataDirRoot, filePath));
      }

      async function loadCurrentAccountSend() {
        const path = getFullApiPath(ApiPath.loadCurrentAccount);

        return await get(path);
      }
    });

    describe('Email change', () => {
      before(authenticate);

      it('allows requesting and then confirming email change', async () => {
        const sameEmail = makeTestEmailAddress(userEmail);
        const { responseBody: sameEmailResponse } = await requestAccountEmailChangeSend(sameEmail);
        expect(sameEmailResponse).to.deep.equal(
          makeInputError<keyof EmailChangeRequestData>('Email did not change', 'newEmail'),
          'rejects a request of change with the same email'
        );

        const invalidEmail: EmailAddress = { kind: 'EmailAddress', value: 'not-an-email' };
        const { responseBody: invalidEmailResponse } = await requestAccountEmailChangeSend(invalidEmail);
        expect(invalidEmailResponse).to.deep.equal(
          makeInputError<keyof EmailChangeRequestData>('Email is syntactically incorrect: "not-an-email"', 'newEmail')
        );

        const newEmail = makeTestEmailAddress(newUserEmail);
        const { responseBody: changeRequestResponse } = await requestAccountEmailChangeSend(newEmail);
        expect(changeRequestResponse).to.deep.equal({ kind: 'Success', message: 'Success' });

        const [confirmationSecret, secretData] = loadStoredEmailChangeConfirmationSecret(newEmail);
        expect(secretData.kind).to.equal('EmailChangeRequestSecretData');
        expect(secretData.accountId).to.deep.include({ kind: 'AccountId' });
        expect(secretData.newEmail).to.deep.equal(newEmail);
        expect(secretData.timestamp).to.exist;

        const timestampSeconds = new Date(secretData.timestamp).getSeconds();
        const nowSeconds = new Date().getSeconds();
        expect(timestampSeconds).to.be.closeTo(nowSeconds, 2);

        const { responseBody: changeConfirmationResponse } = await confirmAccountEmailChangeSend(confirmationSecret);
        expect(changeConfirmationResponse).to.deep.equal({ kind: 'Success', message: 'Confirmed email change' });

        const [storedAccount] = loadStoredAccountByEmail(newEmail.value);
        expect(storedAccount.email).to.deep.equal(newEmail.value);

        await changeBackEmailFrom(newEmail);
      }).timeout(5000);

      async function changeBackEmailFrom(newEmail: EmailAddress) {
        const { responseBody: authenticationResponse } = await authenticationSend(newEmail.value, userPassword);
        expect(authenticationResponse).to.include(
          { kind: 'Success' },
          si`authenticationResponse: ${JSON.stringify(authenticationResponse)}`
        );

        const oldEmail = makeTestEmailAddress(userEmail);
        const { responseBody: changeRequestResponse2 } = await requestAccountEmailChangeSend(oldEmail);
        expect(changeRequestResponse2.kind).to.equal(
          'Success',
          si`changeRequestResponse2: ${JSON.stringify(changeRequestResponse2)}`
        );

        const [oldConfirmationSecret] = loadStoredEmailChangeConfirmationSecret(oldEmail);
        const { responseBody: confirmRequestResponse2 } = await confirmAccountEmailChangeSend(oldConfirmationSecret);
        expect(confirmRequestResponse2.kind).to.equal(
          'Success',
          si`confirmRequestResponse2: ${JSON.stringify(confirmRequestResponse2)}`
        );
      }

      async function requestAccountEmailChangeSend(newEmail: EmailAddress) {
        const request: EmailChangeRequestData = { newEmail: newEmail.value };
        const path = getFullApiPath(ApiPath.requestAccountEmailChange);

        return await post(path, request);
      }

      async function confirmAccountEmailChangeSend(confirmationSecret: ConfirmationSecret) {
        const request: EmailChangeConfirmationRequestData = { secret: confirmationSecret.value };
        const path = getFullApiPath(ApiPath.confirmAccountEmailChange);

        return await post(path, request);
      }
    });

    describe('Password change', () => {
      before(authenticate);

      it('allows changing password', async () => {
        const samePassword = userPassword;
        const { responseBody: samePasswordResponse } = await requestAccountPasswordChangeSend(
          userPassword,
          samePassword
        );
        expect(samePasswordResponse).to.deep.equal(
          makeInputError('New password can’t be the same as the old one', 'newPassword')
        );

        const emptyPassword = '';
        const { responseBody: emptyPasswordResponse } = await requestAccountPasswordChangeSend(
          userPassword,
          emptyPassword
        );
        expect(emptyPasswordResponse).to.deep.equal(
          makeInputError('Missing value', 'newPassword'),
          'empty passwords are not allowed'
        );

        const newPassword = 'A-long-S3cre7-password-changed';
        const { responseBody } = await requestAccountPasswordChangeSend(userPassword, newPassword);
        expect(responseBody).to.deep.equal({ kind: 'Success', message: 'Success' });

        const newPasswordHash = hash(newPassword, appSettings.hashingSalt);
        const [storedAccount] = loadStoredAccountByEmail(userEmail);
        expect(storedAccount.hashedPassword).to.equal(newPasswordHash);

        await changeBackPasswordFrom(newPassword);
      });

      async function changeBackPasswordFrom(newPassword: string) {
        const { responseBody } = await requestAccountPasswordChangeSend(newPassword, userPassword);
        expect(responseBody).to.deep.equal({ kind: 'Success', message: 'Success' });
      }

      async function requestAccountPasswordChangeSend(currentPassword: string, newPassword: string) {
        const request: PasswordChangeRequestData = { currentPassword, newPassword };
        const path = getFullApiPath(ApiPath.requestAccountPasswordChange);

        return await post(path, request);
      }
    });

    describe('Delete account with password', () => {
      it('deletes the authenticated account and its storage', async () => {
        const deleteAccountEmail = 'api-test-delete-account@feedsubscription.com';
        const deleteAccountPassword = 'DeleteMe123!';
        const deleteEmailAddress = makeTestEmailAddress(deleteAccountEmail);
        const deleteAccountId = getAccountIdByEmail(deleteEmailAddress, appSettings.hashingSalt);
        const accountStoragePath = makePath(dataDirRoot, getAccountStorageKey(deleteAccountId));

        deleteAccount(deleteEmailAddress); // clean up leftovers from previous runs
        await deauthenticationSend();

        const { responseBody: registrationResponse } = await registrationSend(
          planId,
          deleteAccountEmail,
          deleteAccountPassword
        );
        expect(registrationResponse).to.include({ kind: 'Success' }, 'registration failed for delete-account user');

        const { responseBody: confirmationResponse } = await registrationConfirmationSend(deleteAccountEmail);
        expect(confirmationResponse).to.include({ kind: 'Success' }, 'confirmation failed for delete-account user');

        const { responseBody: authenticationResponse } = await authenticationSend(
          deleteAccountEmail,
          deleteAccountPassword
        );
        expect(authenticationResponse).to.include({ kind: 'Success' }, 'authentication failed for delete-account user');

        const { responseBody: deletionResponse } = await post(getFullApiPath(ApiPath.deleteAccountWithPassword), {
          password: deleteAccountPassword,
        });
        expect(deletionResponse).to.include({ kind: 'Success', message: 'Success' });
        expect((deletionResponse as Success).responseData).to.deep.equal({});
        expect(fileExists(accountStoragePath)).to.be.false;

        await deauthenticationSend();
      }).timeout(15000);
    });
  });

  describe('Forgot password endpoints', () => {
    const emailAddress = makeTestEmailAddress(userEmail);
    let confirmationSecret: ConfirmationSecret;

    it('stores the confirmation secret (and sends an email)', async () => {
      const { responseBody } = await requestPasswordReset(userEmail);

      const expectedResponse: Success<void> = {
        kind: 'Success',
        message: 'OK',
      };
      expect(responseBody).to.deep.equal(expectedResponse);

      const [secret, secretData] = loadPasswordResetConfirmationSecret(emailAddress);
      const expectedSecretData: PasswordResetConfirmationSecretData = {
        accountId: getAccountIdByEmail(emailAddress, appSettings.hashingSalt).value,
      };
      expect(secretData, JSON.stringify(secretData)).to.deep.include(expectedSecretData);
      confirmationSecret = secret;
    }).timeout(5000);

    it('updates the account password hash and deletes the confirmation secret', async () => {
      const newPassword = 'the-new-53cret-p455w0rd';
      const { responseBody } = await confirmPasswordReset(confirmationSecret, newPassword);

      const expectedResponse: Success<{}> = {
        kind: 'Success',
        message: 'OK',
        responseData: {},
      };
      expect(responseBody).to.deep.equal(expectedResponse);

      const [storedAccount] = loadStoredAccountByEmail(emailAddress.value);
      const newPasswordHash = hash(newPassword, appSettings.hashingSalt);
      expect(storedAccount.hashedPassword).to.equal(newPasswordHash);

      const result = doesConfirmationSecretExist(confirmationSecret);
      expect(result, 'confirmation secred has been deleted').to.be.false;
    }).timeout(5000);

    async function requestPasswordReset(email: string) {
      const request: PasswordResetRequestData = { email };
      const path = getFullApiPath(ApiPath.requestPasswordReset);

      return await post(path, request);
    }

    async function confirmPasswordReset(secret: ConfirmationSecret, newPassword: string) {
      const request: PasswordResetConfirmationData = { secret: secret.value, newPassword };
      const path = getFullApiPath(ApiPath.confirmPasswordReset);

      return await post(path, request);
    }
  }).timeout(5000);

  after(() => {
    const cleanup = deleteAccount(makeTestEmailAddress(userEmail));
    expect(isErr(cleanup), si`cleanup deleteAccount failed: ${JSON.stringify(cleanup)}`).to.be.false;
  });

  function getCookie(responseHeaders: Headers, cookieName: string): Record<string, string | undefined> | null {
    const rawCookie = responseHeaders
      .get('set-cookie')
      ?.split(/, [^\d]/)
      .find((x) => x.startsWith(si`${cookieName}=`));

    if (!rawCookie) {
      return null;
    }

    return cookie.parse(rawCookie);
  }

  async function deauthenticationSend() {
    return post(getFullApiPath(ApiPath.deauthentication));
  }

  async function addNewFeedSend(request: AddNewFeedRequestData) {
    const data = request as Record<string, string>;

    return await post(getFullApiPath(ApiPath.addNewFeed), data);
  }

  async function editFeedSend(request: EditFeedRequestData) {
    const path = getFullApiPath(ApiPath.editFeed);
    const data = request as Record<string, string>;

    return await post(path, data);
  }

  async function deleteFeedSend(feedId: FeedId) {
    const data: DeleteFeedRequestData = { feedId: feedId.value };
    const path = getFullApiPath(ApiPath.deleteFeed);

    return await post(path, data);
  }

  async function authenticationSend(email: string, password: string) {
    return post(getFullApiPath(ApiPath.authentication), { email, password });
  }

  async function registrationSend(planId: PlanId, email: string, password: string) {
    return post(getFullApiPath(ApiPath.registration), { planId, email, password });
  }

  async function registrationConfirmationSend(email: string) {
    const appSettings = loadJSON(makePath('settings.json')) as AppSettings;
    const secret = makeRegistrationConfirmationSecretHash(makeTestEmailAddress(email), appSettings.hashingSalt);

    return post(getFullApiPath(ApiPath.registrationConfirmation), { secret });
  }

  function getAccountId(email: string): AccountId {
    const hashingSalt = appSettings.hashingSalt;

    return getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
  }

  function loadStoredAccountByEmail(email: string): [AccountData, AccountId] {
    const accountId = getAccountId(email);

    return [loadJSON(makePath(getAccountStorageKey(accountId))), accountId] as [AccountData, AccountId];
  }

  function loadStoredEmailChangeConfirmationSecret(
    email: EmailAddress
  ): [ConfirmationSecret, EmailChangeRequestSecretData] {
    const hashingSalt = appSettings.hashingSalt;
    const hash = makeEmailChangeConfirmationSecretHash(email, hashingSalt);

    return loadConfirmationSecret<EmailChangeRequestSecretData>(hash);
  }

  function loadPasswordResetConfirmationSecret(
    email: EmailAddress
  ): [ConfirmationSecret, PasswordResetConfirmationSecretData] {
    const hashingSalt = appSettings.hashingSalt;
    const hash = makePasswordResetConfirmationSecretHash(email, hashingSalt);

    return loadConfirmationSecret<PasswordResetConfirmationSecretData>(hash);
  }

  function loadConfirmationSecret<T>(hash: string): [ConfirmationSecret, T] {
    const secret = makeTestConfirmationSecret(hash);

    return [secret, loadJSON(makePath(getConfirmationSecretStorageKey(secret))) as T];
  }

  function doesConfirmationSecretExist(secret: ConfirmationSecret): boolean {
    return fileExists(makePath(dataDirRoot, getConfirmationSecretStorageKey(secret)));
  }

  function loadAppSettings(): AppSettings {
    return loadJSON(makePath(appSettingsStorageKey));
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

  async function post(relativePath: string, data: Record<string, string> = {}): Promise<JsonApiResponse> {
    const response = await fetch(makePath(apiOrigin, relativePath), {
      method: 'POST',
      body: new URLSearchParams(data),
    });

    return {
      responseBody: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text(),
      responseHeaders: response.headers,
    };
  }

  async function get(path: string, type: 'text'): Promise<TextApiResponse>;
  async function get<D extends any = any>(path: string, type: 'json'): Promise<JsonApiResponse<D>>;
  async function get<D extends any = any>(path: string): Promise<JsonApiResponse<D>>;
  async function get<D extends any = any>(
    relativePath: string,
    type: 'json' | 'text' = 'json',
    headers?: Headers
  ): Promise<JsonApiResponse<D> | TextApiResponse> {
    const url = new URL(relativePath, apiOrigin);
    const response = await fetch(url, { headers });

    return {
      responseBody: await response[type](),
      responseHeaders: response.headers,
    };
  }

  function loadJSON(filePath: string) {
    const jsonString = readFile(makePath(dataDirRoot, filePath));
    return JSON.parse(jsonString);
  }

  async function authenticate() {
    const { responseBody } = await authenticationSend(userEmail, userPassword);
    expect(responseBody).to.include({ kind: 'Success' }, si`responseBody: ${JSON.stringify(responseBody)}`);
  }
});
