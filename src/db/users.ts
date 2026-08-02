export interface MockUser {
  userId: string;
  username: string;
  role: string;
  token: string;
}

export const users: MockUser[] = [
    {
        userId: "tenant123",
        username: "tenantUser",
        role: "tenant",
        token: "mock-jwt-tenant"
    },

    {
        userId: "landlord123",
        username: "landlordUser",
        role: "landlord",
        token: "mock-jwt-landlord"
    }
];
