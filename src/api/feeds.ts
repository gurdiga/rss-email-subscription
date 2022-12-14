import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AccountId } from '../domain/account';
import { Feed } from '../domain/feed';
import { makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, Result } from '../shared/lang';
import { AppRequestHandler } from './request-handler';
import { SessionFields } from './session';

interface Input extends Pick<SessionFields, 'accountId'> {
  accountId: unknown;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  accountId: AccountId;
}

export const feeds: AppRequestHandler = async function feeds(_reqId, _reqBody, _reqParams, reqSession, _app) {
  const { accountId } = reqSession as Input;
  const processInputResult = processInput({ accountId });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const logData = { accountId: processInputResult.accountId };
  const data = getFeedsByAccountId(processInputResult.accountId);

  return makeSuccess('Feeds!', logData, data);
};

function getFeedsByAccountId(_TODO_accountId: AccountId): Feed[] {
  // TODO: Get the real feeds

  return [
    {
      kind: 'Feed',
      displayName: 'Test Feed',
      hashingSalt: 'Random-16-bytes.',
      url: new URL('https://test.com'),
      fromAddress: makeEmailAddress('fromAddress@test.com') as EmailAddress,
      replyTo: makeEmailAddress('replyTo@test.com') as EmailAddress,
      cronPattern: '* * * * *',
    },
  ];
}

function processInput(_TODO_input: Input): Result<ProcessedInput> {
  return {
    kind: 'ProcessedInput',
    accountId: 'TODO',
  };
}
