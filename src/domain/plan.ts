import { makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export enum PlanId {
  'Free' = 'free',
  'PayPerUse' = 'ppu',
  'SDE' = 'sde',
}

interface Plan {
  maxEmailsPerMonth: number;
  maxEmailsPerDay: number;
  pricePerEmailCents: number;
}

export const Plans: Record<PlanId, Plan> = {
  [PlanId.Free]: {
    maxEmailsPerMonth: 15_000,
    maxEmailsPerDay: 2_000,
    pricePerEmailCents: 0,
  },
  [PlanId.PayPerUse]: {
    maxEmailsPerMonth: 150_000,
    maxEmailsPerDay: 10_000,
    pricePerEmailCents: 0.1,
  },
  [PlanId.SDE]: {
    maxEmailsPerMonth: 150_000,
    maxEmailsPerDay: 10_000,
    pricePerEmailCents: 0,
  },
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
