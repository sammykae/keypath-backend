// src/core/utils/mappers.ts
import { Property } from "../../modules/properties/types/propertyInterface";
import { PropertyModel } from "../../modules/properties/models/propertyModel";

export const mapPropertyDocToProperty = (doc: any): Property => ({
  propertyId: doc._id.toString(),
  name: doc.name,
  slug: doc.slug,
  type: doc.type,
  ownerEntityId: doc.ownerEntityId.toString(),
  assetManagerId: doc.assetManagerId ? doc.assetManagerId.toString() : undefined,
  externalIds: doc.externalIds || {},
  address: {
    address1: doc.address.address1,
    address2: doc.address.address2,
    city: doc.address.city,
    state: doc.address.state,
    postalCode: doc.address.postalCode,
    country: doc.address.country,
  },
  geo: {
    lat: doc.geo.lat,
    lng: doc.geo.lng,
  },
  totalUnits: doc.totalUnits,
  token: {
    symbol: doc.token.symbol,
    total: doc.token.total,
    remaining: doc.token.remaining,
    split: doc.token.split,
    issuancePolicy: doc.token.issuancePolicy,
    network: doc.token.network,
    tokenDocs: doc.token.tokenDocs,
  },
    timeZone: doc.timeZone, 
  visibility: doc.visibility,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});
