import { Organization } from "../models/organization.model";
import { OrgCreateDTO } from "../validations/orgValidation";

export const createOrg = async (data: OrgCreateDTO) => {
  const org = new Organization(data);
  return await org.save();
};

export const listOrgs = async () => {
  return await Organization.find();
};
