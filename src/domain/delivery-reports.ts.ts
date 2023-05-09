import { FeedId, makeFeedId } from './feed-id';
import { Result, makeValues } from '../shared/lang';

export interface DeliveryReportsRequestData {
  feedId: string;
}

interface DeliveryReportsRequest {
  feedId: FeedId;
}

export function makeDeliveryReportsRequest(data: unknown): Result<DeliveryReportsRequest> {
  return makeValues<DeliveryReportsRequest>(data, {
    feedId: makeFeedId,
  });
}

export type DeliveryReports = DeliveryReport[];
export interface DeliveryReport {
  // TODO
}
