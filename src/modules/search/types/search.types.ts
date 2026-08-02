export interface SearchResult {
  type: 'tenant' | 'property' | 'unit' | 'action' | 'help';
  label: string;
  subLabel?: string;
  route: string;
  confidence: number;
}

export interface SearchContext {
  userId: string;
  orgId: string | null;
  role: string;
}
