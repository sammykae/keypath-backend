export interface Offer {
  id?: number;
  portfolioId: string;
  buyerId: string;
  offerAmount: number;
  currency: string;
  paymentMethod: 'fiat' | 'crypto';
  status?: 'pending' | 'accepted' | 'rejected';
}
