import { z } from "zod";
import { isoDateOrDateOnlySchema } from "../../../validators/common";

export const EmploymentZ = z.object({
  employerName: z.string(),
  position: z.string(),
  income: z.number(),
  startDate: isoDateOrDateOnlySchema,
  endDate: isoDateOrDateOnlySchema.optional(),
});

export const EmploymentArrayZ = z.array(EmploymentZ);

export type EmploymentDTO = z.infer<typeof EmploymentZ>;
export type EmploymentArrayDTO = z.infer<typeof EmploymentArrayZ>;
