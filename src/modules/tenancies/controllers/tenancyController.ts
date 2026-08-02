import { Request, Response } from "express";
import { ZodError, ZodIssue } from "zod";
import { createTenancy } from "../services/tenancyService";
import { AppError } from "../../../core/errors/AppError";

export const createTenancyHandler = async (req: Request, res: Response) => {
  try {
    const tenancy = await createTenancy(req.body);
    res.status(201).json({
      message: "Tenancy created successfully",
      tenancy,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((e: ZodIssue) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
      return;
    }
    console.error("Unexpected error in create tenancy:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
