import { Request, Response } from 'express';
import { evaluateRiskBadges } from '../services/riskBadge.service';
import { successResponse, errorResponse } from '../../../core/utils/response';
import type { OnboardingCardInput } from '../types/riskBadge.types';
import { DEFAULT_REQUIRED_CARD_FIELDS } from '../types/riskBadge.types';
import type { EvaluateRiskBadgesBody } from '../validators/riskBadge.validators';

const VALID_CARD_KEYS: (keyof OnboardingCardInput)[] = [
  'id',
  'insuranceExpiryDate',
  'noticeOfDefault',
  'mortgageAmount',
  'propertyValue',
  'ownershipPct',
  'expectedOwnershipPct',
];

export async function evaluateRiskBadgesHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as unknown;
    if (!user) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const { cards, requiredFieldKeys } = req.body as EvaluateRiskBadgesBody;
    const cardsTyped: OnboardingCardInput[] = cards.map((c) => ({
      id: c.id,
      insuranceExpiryDate: c.insuranceExpiryDate ?? undefined,
      noticeOfDefault: c.noticeOfDefault ?? undefined,
      mortgageAmount: c.mortgageAmount ?? undefined,
      propertyValue: c.propertyValue ?? undefined,
      ownershipPct: c.ownershipPct ?? undefined,
      expectedOwnershipPct: c.expectedOwnershipPct ?? undefined,
    }));
    const keys =
      requiredFieldKeys?.filter((k): k is keyof OnboardingCardInput =>
        VALID_CARD_KEYS.includes(k as keyof OnboardingCardInput)
      ) ?? DEFAULT_REQUIRED_CARD_FIELDS;
    const result = evaluateRiskBadges(cardsTyped, keys);
    successResponse(res, result);
  } catch (err) {
    console.error('Risk badge evaluation error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to evaluate risk badges');
  }
}
