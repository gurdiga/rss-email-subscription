import { Result, hasKind, makeValues } from '../shared/lang';
import { DeliveryStatus } from './delivery-status';
import { FeedId, makeFeedId } from './feed-id';

export type DeliveryReportsRequestData = Record<'feedId', string>;

interface DeliveryReportsRequest {
  feedId: FeedId;
}

export interface DeliveryReportResponse {
  reports: DeliveryReportData[];
  isNotPaidPlan?: boolean;
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

export interface DeliveryReportData {
  deliveryStart: string;
  postTitle: string;
  postURL: string;
  messageCounts: MessageCounts;
}

export function makeDeliveryReportData(report: DeliveryReport): DeliveryReportData {
  return {
    deliveryStart: report.deliveryStart.toJSON(),
    postTitle: report.postTitle,
    postURL: report.postURL.toString(),
    messageCounts: report.messageCounts,
  };
}

export type MessageCounts = Record<DeliveryStatus, number>;

export function isDeliveryReport(value: unknown): value is DeliveryReport {
  return hasKind(value, 'DeliveryReport');
}
