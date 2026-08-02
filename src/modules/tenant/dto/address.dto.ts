import { z } from "zod";

export const AddressZ = z.object({
  address1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
  moveInDate: z.string().datetime().optional(),
});


export type AddressDTO = z.infer<typeof AddressZ>;
