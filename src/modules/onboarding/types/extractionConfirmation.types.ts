import { Types } from 'mongoose';

export type ExtractionSource = 'ai' | 'manual';

export interface ExtractionLineage {
  extractionId?: string;
  model?: string;
  documentId?: string;
  extractedAt?: string;
}

export interface AiExtractionFieldRecord {
  userId: Types.ObjectId;
  scope: string;
  fieldKey: string;
  value: unknown;
  source: ExtractionSource;
  confidence?: number;
  lineage?: ExtractionLineage;
  confirmedAt?: Date;
  confirmedByUserId?: Types.ObjectId;
  overwrittenAt?: Date;
  overwrittenByUserId?: Types.ObjectId;
  previousValue?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractionFieldDTO {
  fieldKey: string;
  value: unknown;
  source: ExtractionSource;
  confidence?: number;
  lineage?: ExtractionLineage;
}

export interface ExtractionFieldResponse {
  fieldKey: string;
  value: unknown;
  source: ExtractionSource;
  confidence?: number;
  lineage?: ExtractionLineage;
  confirmed: boolean;
  confirmedAt?: string;
  overwrittenAt?: string;
  scope?: string;
}
