import { sampleData } from "../../../db/mockProperties";
import { Property } from "../../properties/types/propertyInterface";

export const calculateTokenization = (rentAmount: number, propertyId: string) => {
  if (!rentAmount || !propertyId) {
    throw new Error("Missing rentAmount or propertyId");
  }

  const property: Property | undefined = sampleData.find(
    (p: Property) => p.propertyId === propertyId
  );

  if (!property) {
    throw new Error("Property not found");
  }


  const tokensReceived = (rentAmount / property.token.total) * property.token.total;

 
  const ownershipPercentage = (tokensReceived / property.token.total) * 100;

  return {
    tokensReceived: tokensReceived.toFixed(2),
    ownershipPercentage: ownershipPercentage.toFixed(2) + "%",
  };
};
