import bcrypt from 'bcryptjs';
import { connectDB } from '../src/core/config/db';
import { User } from "../src/modules/auth/models/user.model";
import { Organization } from "../src/modules/orgs/models/organization.model";
import { Membership } from "../src/modules/orgs/models/membership.model";

export const seed = async () => {
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await User.create({
    email: "admin@keypath.io",
    passwordHash,
    role: "ADMIN",
    status: "ACTIVE",
  });

  const org = await Organization.create({
    name: "KeyPath Admin Org",
    type: "LANDLORD_ORG",
    primaryContactUserId: admin._id,
  });

  await Membership.create({
    userId: admin._id,
    orgId: org._id,
    roleInOrg: "ADMIN",
    status: "active",
  });

  console.log("✅ Seed completo! Admin: admin@keypath.io / admin123");
};

const main = async () => {
  await connectDB();
  await seed();
  process.exit(0);
};

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
