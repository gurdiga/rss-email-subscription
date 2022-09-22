import { EmailHash } from '../app/email-sending/emails';
import { Result, makeErr } from '../shared/lang';
import { ApiResponse } from '../shared/api-response';
import { AppStorage } from '../shared/storage';

export type AppRequestHandler = (
  reqId: number,
  reqBody: Record<string, any>,
  reqParams: Record<string, any>,
  storage: AppStorage
) => Promise<ApiResponse>;

interface SubscriptionId {
  feedId: string;
  emailHash: EmailHash;
}

export function parseSubscriptionId(id: any): Result<SubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const match = /^(?<feedId>.+)-(?<emailHash>[^-]+)$/.exec(id);

  if (!match || !match.groups) {
    return makeErr(`Invalid subscription ID`);
  }

  const { feedId, emailHash } = match.groups as { feedId: string; emailHash: string };

  return {
    feedId,
    emailHash,
  };
}
