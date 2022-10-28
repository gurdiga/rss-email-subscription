import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { FeedSettings } from '../domain/feed-settings';
import { makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './request-handler';

export const feeds: AppRequestHandler = async function feeds(_reqId, _reqBody, _reqParams, _reqSession, _app) {
  const logData = {};
  const data: FeedSettings[] = [
    {
      kind: 'FeedSettings',
      displayName: 'Test Feed',
      hashingSalt: 'Random-16-bytes.',
      url: new URL('https://test.com'),
      fromAddress: makeEmailAddress('fromAddress@test.com') as EmailAddress,
      replyTo: makeEmailAddress('replyTo@test.com') as EmailAddress,
      cronPattern: '* * * * *',
    },
  ];

  // TODO: Get the real feeds

  return makeSuccess('Feeds!', logData, data);
};
