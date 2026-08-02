import { Portfolio } from '../modules/marketplace/types/portfolioTypes'

const portfoliosData: Portfolio[] = [
  {
    id: "portfolio1",
    landlordName: "João Silva",
    location: "Lisboa, Portugal",
    capRate: 5.6,
    tokenSupply: 10000,
    impactMetrics: {
      retentionUplift: "12%",
      affordabilityPreserved: "85%"
    }
  },
];

export default portfoliosData;