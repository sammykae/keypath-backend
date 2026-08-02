import { Property } from "../modules/properties/types/propertyInterface";


export const sampleData: Property[] = [
  {
    propertyId: "1",
    name: "My Property",
    slug: "my-property",
    type: "single_family",
    ownerEntityId: "owner1",
    address: {
      address1: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US"
    },
    geo: { lat: 40.7128, lng: -74.0060 },
    timeZone: "America/New_York",
    totalUnits: 1,
    token: {
      symbol: "KPT-CHSTRFD",
      total: 1000,
      remaining: 1000,
      split: { landlord: 0.5, tenants: 0.3, community: 0.1, investors: 0.1 }
    },
    visibility: "private",
    status: "draft"
  }
];
