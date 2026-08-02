import { Request, Response } from "express";
import { createTenant, createTenantCore, verifyTenantEmail } from "../services/tenants.services";
import { AppError } from "../../../core/errors/AppError";
import { ZodError } from "zod";

export const signup = async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId || (req as any).user?._id;
    const tenant = await createTenant(req.body, actorId);
    res.status(201).json({ message: "Tenant created successfully", tenant });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err instanceof ZodError) {
      const message = err.issues.map((e) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
    } else {
      console.error("Unexpected error in signup:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// BE-201 core identity create (independent of property/participation)
export const createCoreTenant = async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth as any;
    const tenant = await createTenantCore(req.body, { _id: auth?._id?.toString(), role: auth?.role });
    res.status(201).json({ message: "Tenant created successfully", tenant });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err instanceof ZodError) {
      // Return readable validation errors to client
      const message = err.issues.map((e) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
    } else {
      console.error("Unexpected error in createCoreTenant:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// BE-201: email verification token flow (for SELF_SIGNUP)
export const verifyCoreTenantEmail = async (req: Request, res: Response) => {
  try {
    const tenant = await verifyTenantEmail(req.body);
    res.status(200).json({ message: "Email verified successfully", tenant });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err instanceof ZodError) {
      const message = err.issues.map((e) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
    } else {
      console.error("Unexpected error in verifyCoreTenantEmail:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
