export type ParticipationType = "RPA" | "TEPA" | "BOTH" | "NONE";

export interface OccupiedUnitParticipationRecord {
  unit: {
    unitId: string;
    unitNumber: string | null;
    propertyId: string;
    unitStatus: string;
    leaseStart: string | null;
    leaseEnd: string | null;
  };
  tenant: {
    tenantUserId: string;
    email: string | null;
    name: string | null;
  };
  participationType: ParticipationType;
  rewardsEligibility: boolean;
  tepaEligibility: boolean;
}

