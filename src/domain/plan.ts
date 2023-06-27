import { Err, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export enum PlanId {
  Free = 'free',
  SDE = 'sde',
  Courage = 'courage',
  Strength = 'strength',
  Mastery = 'mastery',
}

export interface Plan {
  title: string;
  maxEmailsPerMonth: number;
  maxEmailsPerDay: number;
  isSubscription: boolean;
}

export const Plans: Record<PlanId, Plan> = {
  [PlanId.Free]: {
    title: 'Free Plan',
    maxEmailsPerMonth: 5_000,
    maxEmailsPerDay: 1_000,
    isSubscription: false,
  },
  [PlanId.SDE]: {
    title: 'SDE Plan',
    maxEmailsPerMonth: 500_000,
    maxEmailsPerDay: 25_000,
    isSubscription: false,
  },
  [PlanId.Courage]: {
    title: 'Courage Plan',
    maxEmailsPerMonth: 15_000,
    maxEmailsPerDay: 1_500,
    isSubscription: true,
  },
  [PlanId.Strength]: {
    title: 'Strength Plan',
    maxEmailsPerMonth: 40_000,
    maxEmailsPerDay: 4_000,
    isSubscription: true,
  },
  [PlanId.Mastery]: {
    title: 'Mastery Plan',
    maxEmailsPerMonth: 100_000,
    maxEmailsPerDay: 1_000,
    isSubscription: true,
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

export function isSubscriptionPlan(planIdString: string): boolean {
  const planId = makePlanId(planIdString);

  if (isErr(planId)) {
    return false;
  }

  return Plans[planId].isSubscription;
}

export function makeNotASubscriptionPlanErr(planId: PlanId): Err {
  return makeErr(si`Not a subscription plan: "${planId}"`);
}
