import { z } from "zod";
import { isoDateOrDateOnlySchema } from "../../../validators/common";

export const RentalRefZ = z.object({
  landlordName: z.string(),
  landlordPhone: z.string(),
  address: z.string(),
  startDate: isoDateOrDateOnlySchema,
  endDate: isoDateOrDateOnlySchema.optional(),
});


export const RentalRefArrayZ = z.array(RentalRefZ);

export type RentalRefDTO = z.infer<typeof RentalRefZ>;
export type RentalRefArrayDTO = z.infer<typeof RentalRefArrayZ>;
