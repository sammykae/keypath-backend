import { Request, Response } from "express";
import { calculateTokenization } from "../../tokenization/services/tokenizationServices";

export const postTokenization = (req: Request, res: Response): void => {
  try {
    const { rentAmount, propertyId } = req.body;

    const result = calculateTokenization(rentAmount, propertyId);

    res.json(result);
  } catch (error: any) {
    console.error("Erro na tokenization:", error);
    
    if (error.message === "Missing rentAmount or propertyId") {
      res.status(400).json({ error: error.message });
    } else if (error.message === "Property not found") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Erro interno no servidor" });
    }
  }
};
