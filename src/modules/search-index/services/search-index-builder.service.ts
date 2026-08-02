// Full-index rebuild: safe to import entity models here — this file is NOT imported
// by any model file, so there is no circular dependency.
import { TenantModel } from '../../tenant/models/tenants.models';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { SearchIndexModel } from '../models/search-index.model';
import {
  upsertTenantEntry,
  upsertPropertyEntry,
  upsertUnitEntry,
} from './search-index.service';

export interface BuildResult {
  properties: number;
  units: number;
  tenants: number;
  durationMs: number;
}

const BATCH = 200;

export async function buildFullIndex(): Promise<BuildResult> {
  const start = Date.now();

  await SearchIndexModel.deleteMany({});

  let properties = 0;
  let cursor = PropertyModel.find({}).lean().cursor();
  for await (const doc of cursor) {
    await upsertPropertyEntry(doc);
    properties++;
  }

  let units = 0;
  cursor = UnitModel.find({}).lean().cursor() as any;
  for await (const doc of cursor as any) {
    await upsertUnitEntry(doc);
    units++;
  }

  let tenants = 0;
  cursor = TenantModel.find({}).lean().cursor() as any;
  for await (const doc of cursor as any) {
    await upsertTenantEntry(doc);
    tenants++;
  }

  return { properties, units, tenants, durationMs: Date.now() - start };
}
