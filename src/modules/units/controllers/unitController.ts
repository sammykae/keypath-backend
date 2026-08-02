import { Request, Response } from "express";
import {
  createUnit,
  findUnitById,
  updateUnit,
  deleteUnit,
  listUnitsByProperty,
} from "../services/unit.service";
import { AppError } from "../../../core/errors/AppError";
import { UnitCreateSchema } from "../dto/unitDTO";

export const create = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    // Accept synonyms beds/baths and marketRent (UI / legacy) — DTO expects bedrooms/bathrooms/rent
    const normalized = {
      propertyId: String(body.propertyId ?? ""),
      unitNumber: String(body.unitNumber ?? ""),
      label: body.label === undefined || body.label === null ? undefined : String(body.label),
      bedrooms: Number(body.bedrooms ?? body.beds ?? 0),
      bathrooms: Number(body.bathrooms ?? body.baths ?? 0),
      squareFootage:
        body.squareFootage === undefined || body.squareFootage === null
          ? undefined
          : Number(body.squareFootage),
      status: body.status ?? "VACANT",
      rent: Number(body.rent ?? body.marketRent ?? 0),
      marketRent:
        body.marketRent === undefined || body.marketRent === null ? undefined : Number(body.marketRent),
      scheduledRent:
        body.scheduledRent === undefined || body.scheduledRent === null
          ? undefined
          : Number(body.scheduledRent),
    };

    const parsed = UnitCreateSchema.safeParse(normalized);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const unit = await createUnit(parsed.data);
    res.status(201).json({ message: "Unit created successfully", unit });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
       console.error("Unexpected error in create unit:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const unit = await findUnitById(req.params.id);
    if (!unit) {
      throw new AppError("Unit not found", 404);
    }
    res.status(200).json(unit);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const updatedUnit = await updateUnit(req.params.id, req.body);
    if (!updatedUnit) {
      throw new AppError("Unit not found", 404);
    }
    res.status(200).json({ message: "Unit updated successfully", updatedUnit });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const deletedUnit = await deleteUnit(req.params.id);
    if (!deletedUnit) {
      throw new AppError("Unit not found", 404);
    }
    res.status(200).json({ message: "Unit deleted successfully" });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const listByProperty = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const filters = req.query;

    const units = await listUnitsByProperty(propertyId, {
      status: filters.status as string,
      minRent: filters.minRent ? Number(filters.minRent) : undefined,
      maxRent: filters.maxRent ? Number(filters.maxRent) : undefined,
      bedrooms: filters.bedrooms ? Number(filters.bedrooms) : undefined,
    });

    res.status(200).json(units);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
