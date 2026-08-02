import { Token } from '../modules/tokens/types/tokenInterface';

const tokenData: Token[] = [
  {
    userId: "renter123",
    role: "renter",
    propertyId: "property001",
    tokensOwned: 120,
    vesting: true
  },
  {
    userId: "stakeholder999",
    role: "stakeholder",
    propertyId: "propertyABC",
    tokensOwned: 500,
    vesting: false
  }
];

export default tokenData;
