export interface ImpactMetrics {
  retentionUplift: string;
  affordabilityPreserved: string;
}

export interface Portfolio {
  id: string;
  landlordName: string;
  location: string;
  capRate: number;
  tokenSupply: number;
  impactMetrics: ImpactMetrics;
}
