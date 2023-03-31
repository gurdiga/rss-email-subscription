import { makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export enum PlanId {
  'Free' = 'free',
  'PayPerUse' = 'ppu',
  'SDE' = 'sde',
}

export const PlanNames: Record<PlanId, string> = {
  [PlanId.Free]: '❤️ Free',
  [PlanId.PayPerUse]: '💪 Pay-Per-Use',
  [PlanId.SDE]: '💙 SDE',
};

export function isPlanId(planId: unknown): planId is PlanId {
  return typeof planId === 'string' && Object.values(PlanId).includes(planId as any);
}

export function makePlanId(planId: string, field = 'planId'): Result<PlanId> {
  const validPlanIds = Object.values(PlanId);

  if (!planId) {
    return makeErr('Invalid plan ID: missing value', field);
  }

  planId = planId.trim();

  if (!validPlanIds.includes(planId as any)) {
    return makeErr(si`Unknown plan ID: ${planId}`, field);
  }

  return planId as PlanId;
}
