export function isNormalizedAiContextPayload(payload: unknown): payload is {
  properties: Record<string, unknown>;
  tenant_participation: Record<string, unknown>;
  ledgers: Record<string, unknown>;
} {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  return (
    typeof o.properties === 'object' &&
    o.properties !== null &&
    !Array.isArray(o.properties) &&
    typeof o.tenant_participation === 'object' &&
    o.tenant_participation !== null &&
    !Array.isArray(o.tenant_participation) &&
    typeof o.ledgers === 'object' &&
    o.ledgers !== null &&
    !Array.isArray(o.ledgers)
  );
}
