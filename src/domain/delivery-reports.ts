import { Result, hasKind, makeValues } from '../shared/lang';
import { DeliveryStatus } from './delivery-status';
import { FeedId, makeFeedId } from './feed-id';

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

export type DeliveryReports = Result<DeliveryReport>[];
export interface DeliveryReport {
  kind: 'DeliveryReport';
  deliveryStart: Date;
  postTitle: string;
  postURL: URL;
  messageCounts: MessageCounts;
}

export type MessageCounts = Record<DeliveryStatus, number>;

export function isDeliveryReport(value: unknown): value is DeliveryReport {
  return hasKind(value, 'DeliveryReport');
}
