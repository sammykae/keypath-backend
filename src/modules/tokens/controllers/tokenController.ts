import tokenData from "../../../db/mockTokens";
import { Request, Response } from "express";


export const getTokens = (req: Request,res: Response)=>{
    res.json(tokenData);
}

export const calculateTokens = (req:Request,res: Response) => {
        const { rentAmount, propertyValue } = req.body;

    if (!rentAmount || !propertyValue) {
    return res.status(400).json({ error: 'Incomplete data' });
  }else {
        const tokensEarned = Math.floor(rentAmount / 1000); 
        res.json({ tokensEarned });
  }
}