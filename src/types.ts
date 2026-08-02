import { Request } from "express";

/**
 * Alias for Request — use Request directly.
 * Express.Request is augmented via src/types/express.d.ts (Express.User).
 * req.user is typed via that augmentation when using Passport.
 */
export type CustomRequest = Request;
