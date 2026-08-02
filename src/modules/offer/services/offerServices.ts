import { Offer } from '../types/offerTypes';

const offers: Offer[] = [];

export const createOffer = (data: Offer): Offer => {
  if (
    !data.portfolioId ||
    !data.buyerId ||
    !data.offerAmount ||
    !data.currency ||
    !data.paymentMethod
  ) {
    throw new Error('Missing required offer fields');
  }

  const newOffer: Offer = {
    id: offers.length + 1,
    ...data,
    status: 'pending',
  };

  offers.push(newOffer);
  return newOffer;
};

export const getAllOffers = (): Offer[] => {
  return offers;
};
