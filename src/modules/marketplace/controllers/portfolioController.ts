import { Request, Response } from 'express';
import { getAllPortfolios } from '../services/portfolioServices';


export const getPortfolios = (req: Request, res: Response): void => {
    const portflios = getAllPortfolios();
    res.json(portflios);
    return;
}