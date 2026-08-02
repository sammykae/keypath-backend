/**
 * Express Request augmentation (official pattern per Express TypeScript docs).
 * Augment the root Express types instead of extending Request with a separate CustomRequest.
 */
declare global {
  namespace Express {
    /** Augment User (used by Passport for req.user) with app-specific shape */
    interface User {
      role?: string;
      [key: string]: unknown;
    }
  }
}

export {};
