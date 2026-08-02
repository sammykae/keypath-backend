import mongoose from 'mongoose';

const MAX_DOCS = 200;
const MAX_STRING = 2000;

function isObjectIdLike(value: unknown): boolean {
  return (
    value instanceof mongoose.Types.ObjectId ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as { toHexString?: () => string }).toHexString === 'function')
  );
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (isObjectIdLike(value)) return String(value);
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(o)) {
      if (n++ >= 40) {
        out._truncatedKeys = true;
        break;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export async function fetchTenantParticipationCollectionByPropertyId(
  propertyId: mongoose.Types.ObjectId
): Promise<Record<string, unknown>[]> {
  const db = mongoose.connection.db;
  if (!db) return [];
  try {
    const rows = await db
      .collection('tenant_participation')
      .find({
        $or: [{ propertyId }, { propertyId: propertyId.toString() }],
      })
      .limit(MAX_DOCS)
      .toArray();
    return rows.map((doc) => sanitizeValue(doc, 0) as Record<string, unknown>);
  } catch {
    return [];
  }
}
