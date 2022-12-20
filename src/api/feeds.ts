import { AccountId, loadAccount } from '../domain/account';
import { Feed, getFeed, isFeed, isFeedNotFound } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage } from '../shared/storage';
import { AppRequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession, SessionFields } from './session';

interface Input extends Pick<SessionFields, 'accountId'> {
  accountId: unknown;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  accountId: AccountId;
}

export const createFeed: AppRequestHandler = async function createFeed(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  _app
) {
  return makeAppError('Not there yet');
};

export const listFeeds: AppRequestHandler = async function listFeeds(_reqId, _reqBody, _reqParams, reqSession, app) {
  const { accountId } = reqSession as Input;
  const processInputResult = processInput({ accountId });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const logData = { accountId: processInputResult.accountId };
  const data = getFeedsByAccountId(processInputResult.accountId, app.storage, app.env.DOMAIN_NAME);

  if (isErr(data)) {
    return makeAppError(data.reason);
  }

  return makeSuccess('Feeds!', logData, data);
};

function getFeedsByAccountId(accountId: AccountId, storage: AppStorage, domainName: string): Result<Feed[]> {
  const module = `${listFeeds.name}-${getFeedsByAccountId.name}`;
  const { logError, logWarning } = makeCustomLoggers({ module });
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeErr('Failed to load feed list');
  }

  const loadedFeeds = account.feedIds.map((feedId) => getFeed(feedId, storage, domainName));
  const validFeeds = loadedFeeds.filter(isFeed);
  const errs = loadedFeeds.filter(isErr);
  const missingFeeds = loadedFeeds.filter(isFeedNotFound);

  if (!isEmpty(errs)) {
    logError(`Errors while loading feeds for account ${accountId}`, { errs });
  }

  if (!isEmpty(missingFeeds)) {
    const missingFeedIds = missingFeeds.map((x) => x.feedId);

    logWarning(`Missing feeds for account ${accountId}`, { missingFeedIds });
  }

  return validFeeds;
}

function processInput(input: Input): Result<ProcessedInput> {
  const module = `${listFeeds.name}-${processInput.name}`;
  const { logWarning } = makeCustomLoggers({ module });
  const session = checkSession(input);

  if (isAuthenticatedSession(session)) {
    logWarning(`Not authenticated`);
    return {
      kind: 'ProcessedInput',
      accountId: session.accountId,
    };
  } else {
    logWarning(`Non-string accountId on session!?: ${input.accountId}`);
    return makeErr('Not authenticated');
  }
}
