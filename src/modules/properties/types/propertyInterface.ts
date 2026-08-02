export interface Property {
  // Identity & ownership
  
  _id?: string;
  propertyId: string;                // MongoDB auto-generated id
  name: string;                // Name of the property/community
  slug: string;                // URL-safe unique identifier
  type: "single_family" | "multifamily" | "btr_community" | "condo_building" | "townhome_community";
  ownerEntityId: string;       // Reference to the owner entity
  assetManagerId?: string;     // Optional reference to staff user
  externalIds?: {              // Optional external system IDs
    appfolio?: string;
    yardi?: string;
    realpage?: string;
    custom?: Record<string, string>;
  };

  // Location & parcel
  address: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US"; // e.g., "US"
  };
  geo: { lat: number; lng: number }; // Geospatial coordinates
  countyFips?: string;
  apnParcelId?: string;        // Assessor’s Parcel Number
  zoning?: string;
  timeZone: string;            // IANA timezone

  // Physical summary
  yearBuilt?: number;
  renovatedYear?: number;
  lotSizeSqft?: number;
  grossBuildingAreaSqft?: number;
  rentableSqft?: number;
  numBuildings?: number;
  totalUnits: number;          // Minimum 1, denormalized cache
  parking?: { totalSpaces?: number; reservedSpaces?: number; evSpots?: number };
  amenities?: string[];        // e.g., pool, gym, playground
  photos?: string[];           // URLs or file IDs
  floorPlans?: { name: string; fileId?: string; url?: string }[];

  // Tokenization
  token: {
    symbol: string;           // Token symbol, e.g., "KPT-CHSTRFD"
    total: number;            // Total supply for the property
    remaining: number;        // Remaining tokens
    split: { landlord: number; tenants: number; community: number; investors: number }; // Must sum to 1
    issuancePolicy?: { vestingMonths?: number; earnRatePerDollarRent?: number };
    network?: "none" | "Ethereum" | "Base" | "Polygon";
    tokenDocs?: string[];      // Offering memos / file references
  };

  // Operations & dashboards
  statsDaily?: {
    date: Date;
    occupancyRate?: number;
    delinquencyRate?: number;
    avgDaysVacant?: number;
    ytdNOI?: number;
    ytdOpEx?: number;
    ytdCapex?: number;
    tokensDistributedYTD?: number;
  };

  // Governance
  visibility: "private" | "investor_portal" | "public_marketing";
  status: "draft" | "active" | "stabilizing" | "stabilized" | "disposed";

  // System timestamps
  createdAt?: Date;
  updatedAt?: Date;
}
// asdsadhudsa