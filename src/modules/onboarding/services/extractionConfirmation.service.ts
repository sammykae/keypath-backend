import { Types } from 'mongoose';
import { AiExtractionFieldModel } from '../models/ai-extraction-confirmation.model';
import type { ExtractionFieldDTO, ExtractionFieldResponse } from '../types/extractionConfirmation.types';

export async function upsertExtractionFields(
  userId: Types.ObjectId,
  scope: string,
  fields: ExtractionFieldDTO[]
): Promise<{ saved: number }> {
  let saved = 0;
  for (const f of fields) {
    await AiExtractionFieldModel.findOneAndUpdate(
      { userId, scope, fieldKey: f.fieldKey },
      {
        $set: {
          value: f.value,
          source: f.source,
          confidence: f.confidence,
          lineage: f.lineage,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    saved += 1;
  }
  return { saved };
}

export async function recordManualOverride(
  userId: Types.ObjectId,
  scope: string,
  fieldKey: string,
  value: unknown,
  overwrittenByUserId: Types.ObjectId
): Promise<{ ok: boolean; message?: string }> {
  const existing = await AiExtractionFieldModel.findOne({ userId, scope, fieldKey }).lean();
  if (!existing) {
    await AiExtractionFieldModel.create({
      userId,
      scope,
      fieldKey,
      value,
      source: 'manual',
      overwrittenByUserId,
      overwrittenAt: new Date(),
    });
    return { ok: true };
  }
  await AiExtractionFieldModel.updateOne(
    { userId, scope, fieldKey },
    {
      $set: {
        value,
        source: 'manual',
        previousValue: existing.value,
        overwrittenAt: new Date(),
        overwrittenByUserId,
        updatedAt: new Date(),
      },
    }
  );
  return { ok: true };
}

export async function confirmFields(
  userId: Types.ObjectId,
  scope: string,
  fieldKeys: string[],
  confirmedByUserId: Types.ObjectId
): Promise<{ confirmed: number }> {
  const result = await AiExtractionFieldModel.updateMany(
    { userId, scope, fieldKey: { $in: fieldKeys } },
    { $set: { confirmedAt: new Date(), confirmedByUserId, updatedAt: new Date() } }
  );
  return { confirmed: result.modifiedCount };
}

export async function getFieldsForScope(
  userId: Types.ObjectId,
  scope: string
): Promise<{ fields: ExtractionFieldResponse[]; unconfirmedCount: number }> {
  const docs = await AiExtractionFieldModel.find({ userId, scope }).lean();
  const fields: ExtractionFieldResponse[] = docs.map((d) => ({
    fieldKey: d.fieldKey,
    value: d.value,
    source: d.source as 'ai' | 'manual',
    confidence: d.confidence,
    lineage: d.lineage,
    confirmed: !!d.confirmedAt,
    confirmedAt: d.confirmedAt?.toISOString(),
    overwrittenAt: d.overwrittenAt?.toISOString(),
  }));
  const unconfirmedCount = fields.filter((f) => !f.confirmed && f.source === 'ai').length;
  return { fields, unconfirmedCount };
}

export async function getUnconfirmedAiFields(
  userId: Types.ObjectId,
  scope?: string
): Promise<ExtractionFieldResponse[]> {
  const filter: Record<string, unknown> = { userId, source: 'ai' };
  if (scope) filter.scope = scope;
  const docs = await AiExtractionFieldModel.find({
    ...filter,
    confirmedAt: { $in: [null, undefined] },
  }).lean();
  return docs.map((d) => ({
    fieldKey: d.fieldKey,
    value: d.value,
    source: d.source as 'ai' | 'manual',
    confidence: d.confidence,
    lineage: d.lineage,
    confirmed: false,
    overwrittenAt: d.overwrittenAt?.toISOString(),
    scope: d.scope,
  }));
}
