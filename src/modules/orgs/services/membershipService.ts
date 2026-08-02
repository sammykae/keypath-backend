import { Membership } from "../models/membership.model";
import { MembershipCreateDTO } from "../validations/membershipValidation";

export const createMembership = async (data: MembershipCreateDTO) => {
  const membership = new Membership(data);
  return await membership.save();
};

export const listMemberships = async () => {
  return await Membership.find().populate("userId").populate("orgId");
};
