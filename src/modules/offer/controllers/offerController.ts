import { Request, Response } from 'express';
import { createOffer, getAllOffers } from '../services/offerServices';
import { Offer } from '../types/offerTypes';

export const createOfferHandler = (req: Request, res: Response): void => {
  try {
    const data: Offer = req.body;
    const newOffer = createOffer(data);
    res.status(201).json({ message: 'Offer created', offer: newOffer });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getOffersHandler = (req: Request, res: Response): void => {
  const offers = getAllOffers();
  res.status(200).json(offers);
};
