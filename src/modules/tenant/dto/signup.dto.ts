import { z } from "zod";
import { isoDateOrDateOnlySchema } from "../../../validators/common";
import { RentalRefZ } from "./rentalRef.dto";
import { EmploymentZ } from "./employment.dto";
import { AddressZ } from "./address.dto";

export const SignupTenantSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email(),
  password: z.string(),
  phone: z.string().optional(),
  dob: isoDateOrDateOnlySchema.optional(),
  ssn: z.string().optional(),
  driversLicense: z.string().optional(),
  employment: z.array(EmploymentZ),
  rentalHistory: z.array(RentalRefZ),
  currentAddress: AddressZ,
});

export type SignupTenantDTO = z.infer<typeof SignupTenantSchema>;
