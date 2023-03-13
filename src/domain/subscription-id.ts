import { EmailHash } from './email-address';
import { Result, makeErr, isErr } from '../shared/lang';
import { FeedId, makeFeedId } from './feed-id';

interface SubscriptionId {
  feedId: FeedId;
  emailHash: EmailHash;
}

export function makeSubscriptionId(id: unknown): Result<SubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const match = /^(?<feedIdString>.+)-(?<emailHashString>[^-]+)$/.exec(id);

  if (!match || !match.groups) {
    return makeErr('Invalid subscription ID');
  }

  const { feedIdString, emailHashString: emailHash } = match.groups as {
    feedIdString: string;
    emailHashString: string;
  };
  const feedId = makeFeedId(feedIdString);

  if (isErr(feedId)) {
    return feedId;
  }

  return {
    feedId,
    emailHash,
  };
}

export interface SubscriptionConfirmationRequest {
  id: SubscriptionId;
}

export type SubscriptionConfirmationRequestData = Record<keyof SubscriptionConfirmationRequest, string>;

export interface UnsubscriptionConfirmationRequest {
  id: SubscriptionId;
}

export type UnsubscriptionConfirmationRequestData = Record<keyof UnsubscriptionConfirmationRequest, string>;
