import { Schema, model } from "mongoose";

const TokenizationConfigSchema = new Schema({
  // coloca aqui os campos que já existem no tokenization (se houver)
  propertyId: { type: String, required: true },
  rentAmount: { type: Number, required: true },
  
  // novo campo pra controlar a rede
  network: {
    type: String,
    enum: ["none", "Polygon", "Base"],
    default: "none",
  },
});

export const TokenizationConfig = model(
  "TokenizationConfig",
  TokenizationConfigSchema
);
