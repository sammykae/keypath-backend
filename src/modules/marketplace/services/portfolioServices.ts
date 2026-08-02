import portfoliosData from "../../../db/mockPortfolio";
import { Portfolio } from "../types/portfolioTypes";

export const getAllPortfolios = (): Portfolio[] => {
    return portfoliosData;
}