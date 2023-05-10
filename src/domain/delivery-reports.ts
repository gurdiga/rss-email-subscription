import { FeedId, makeFeedId } from './feed-id';
import { Err, Result, hasKind, makeErr, makeValues } from '../shared/lang';

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

export type DeliveryReports = Array<DeliveryReport | Err>;
export interface DeliveryReport {
  kind: 'DeliveryReport';
  date: Date;
}

export function isDeliveryReport(value: unknown): value is DeliveryReport {
  return hasKind(value, 'DeliveryReport');
}

export function makeDeliveryReport(_data: unknown): Result<DeliveryReport> {
  // TODO
  return makeErr('Not implemented');
}
