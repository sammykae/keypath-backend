export type CapTableRole = 'landlord' | 'tenant' | 'investor';

export interface CapTableAllocation {
  role: CapTableRole;
  tokens: number;
  ownershipPct: number;
  entityId?: string;
}

export interface CapTableTenantBreakdown {
  entityId: string;
  tokens: number;
  ownershipPct: number;
}

export interface CapTableIssue {
  code: string;
  message: string;
}

/** BE-310: reflects ledger-derived ownership state. */
export interface CapTable {
  property_id: string;
  total_tokens: number;
  ledger_total_tokens: number;
  allocations: CapTableAllocation[];
  tenant_breakdown: CapTableTenantBreakdown[];
  ownership_pct_sum: number;
  consistency: 'OK' | 'MISMATCH';
  errors: CapTableIssue[];
  warnings: CapTableIssue[];
  recalculated_at?: string;
}
