import { makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export type PlanId = 'minimal' | 'standard' | 'sde';

export function isPlanId(planId: unknown): planId is PlanId {
  return typeof planId === 'string' && ['minimal', 'standard', 'sde'].includes(planId);
}

export function makePlanId(planId: string): Result<PlanId> {
  const validPlanIds: PlanId[] = ['minimal', 'standard', 'sde'];

  if (!planId) {
    return makeErr(`Invalid plan ID: missing value`);
  }

  planId = planId.trim();

  if (!validPlanIds.includes(planId as any)) {
    return makeErr(si`Unknown plan ID: ${planId}`);
  }

  return planId as PlanId;
}
