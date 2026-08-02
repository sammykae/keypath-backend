import { CsvIngestionType } from '../models/csv-ingestion.model';

// --- Types ---

export type FieldType = 'string' | 'number' | 'date' | 'email';

export interface CanonicalField {
  name: string;
  type: FieldType;
  required: boolean;
  label: string;
}

/** Maps each CSV header to a canonical field name, or null if unmapped. */
export type ColumnMapping = Record<string, string | null>;

export interface MappingResult {
  mapping: ColumnMapping;
  missingRequired: string[];
}

// --- Canonical schema per ingestion type ---

const SCHEMAS: Record<CsvIngestionType, CanonicalField[]> = {
  TENANT: [
    { name: 'email',        type: 'email',  required: true,  label: 'Email' },
    { name: 'firstName',    type: 'string', required: true,  label: 'First Name' },
    { name: 'lastName',     type: 'string', required: true,  label: 'Last Name' },
    { name: 'phone',        type: 'string', required: false, label: 'Phone' },
    // propertyRef + unitRef together resolve a specific unit for persistence
    // (an org can have the same unit number, e.g. "1A", on multiple properties).
    { name: 'propertyRef',  type: 'string', required: false, label: 'Property Name' },
    { name: 'unitRef',      type: 'string', required: false, label: 'Unit Reference' },
    { name: 'moveInDate',   type: 'date',   required: false, label: 'Move-In Date' },
    { name: 'leaseEndDate', type: 'date',   required: false, label: 'Lease End Date' },
    { name: 'monthlyRent',  type: 'number', required: false, label: 'Monthly Rent' },
  ],
  PROPERTY: [
    { name: 'name',         type: 'string', required: true,  label: 'Property Name' },
    { name: 'address',      type: 'string', required: true,  label: 'Address' },
    { name: 'city',         type: 'string', required: true,  label: 'City' },
    { name: 'state',        type: 'string', required: true,  label: 'State' },
    { name: 'zipCode',      type: 'string', required: true,  label: 'Zip Code' },
    { name: 'country',      type: 'string', required: false, label: 'Country' },
    { name: 'propertyType', type: 'string', required: false, label: 'Property Type' },
  ],
  UNIT: [
    { name: 'unitNumber',  type: 'string', required: true,  label: 'Unit Number' },
    { name: 'propertyRef', type: 'string', required: true,  label: 'Property Reference' },
    { name: 'bedrooms',    type: 'number', required: false, label: 'Bedrooms' },
    { name: 'bathrooms',   type: 'number', required: false, label: 'Bathrooms' },
    { name: 'sqft',        type: 'number', required: false, label: 'Square Feet' },
    { name: 'status',      type: 'string', required: false, label: 'Status' },
    { name: 'monthlyRent', type: 'number', required: false, label: 'Monthly Rent' },
  ],
  PAYMENT: [
    { name: 'amount',          type: 'number', required: true,  label: 'Amount' },
    { name: 'paymentDate',     type: 'date',   required: true,  label: 'Payment Date' },
    { name: 'tenantRef',       type: 'string', required: true,  label: 'Tenant Reference' },
    { name: 'unitRef',         type: 'string', required: false, label: 'Unit Reference' },
    { name: 'paymentType',     type: 'string', required: false, label: 'Payment Type' },
    { name: 'referenceNumber', type: 'string', required: false, label: 'Reference Number' },
  ],
  LEASE: [
    { name: 'tenantRef',       type: 'string', required: true,  label: 'Tenant Reference' },
    { name: 'unitRef',         type: 'string', required: true,  label: 'Unit Reference' },
    { name: 'startDate',       type: 'date',   required: true,  label: 'Start Date' },
    { name: 'endDate',         type: 'date',   required: true,  label: 'End Date' },
    { name: 'monthlyRent',     type: 'number', required: true,  label: 'Monthly Rent' },
    { name: 'securityDeposit', type: 'number', required: false, label: 'Security Deposit' },
  ],
  OTHER: [],
};

// --- Alias dictionary ---
// Each entry lists lower-cased aliases for a canonical field name.
// The canonical name itself is always matched implicitly (see buildAliasLookup).

const CANONICAL_FIELD_ALIASES: Record<string, string[]> = {
  firstName:       ['first_name', 'firstname', 'first name', 'fname', 'given_name', 'given name'],
  lastName:        ['last_name', 'lastname', 'last name', 'lname', 'surname', 'family_name', 'family name'],
  email:           ['email_address', 'emailaddress', 'e-mail', 'e_mail', 'mail'],
  phone:           ['phone_number', 'phonenumber', 'phone number', 'mobile', 'mobile_number', 'cell', 'telephone'],
  unitRef:         ['unit', 'unit_id', 'unitid', 'unit_ref', 'unit_no', 'unit no'],
  moveInDate:      ['move_in_date', 'moveindate', 'move in date', 'move_in', 'lease_start_date', 'lease_start'],
  leaseEndDate:    ['lease_end_date', 'leaseenddate', 'lease end date', 'lease_end', 'move_out_date'],
  monthlyRent:     ['monthly_rent', 'monthlyrent', 'monthly rent', 'rent', 'rent_amount', 'monthly_amount'],
  name:            ['property_name', 'propertyname', 'property name', 'building_name', 'building name'],
  address:         ['street_address', 'street address', 'address_line1', 'address line 1', 'address_line_1'],
  city:            ['city_name'],
  state:           ['state_name', 'province'],
  zipCode:         ['zip_code', 'zipcode', 'zip code', 'postal_code', 'postal code', 'zip'],
  country:         ['country_name'],
  propertyType:    ['property_type', 'propertytype', 'property type'],
  unitNumber:      ['unit_number', 'unitnumber', 'unit number', 'unit_no', 'unit no', 'unit', 'apt', 'apt_number', 'apartment'],
  propertyRef:     ['property', 'property_id', 'propertyid', 'property_ref', 'building', 'property_name', 'property name'],
  bedrooms:        ['beds', 'bedroom', 'bed', 'num_bedrooms', 'num_beds', 'bedroom_count'],
  bathrooms:       ['baths', 'bathroom', 'bath', 'num_bathrooms', 'num_baths', 'bathroom_count'],
  sqft:            ['sq_ft', 'square_feet', 'square feet', 'floor_area', 'area_sqft'],
  status:          ['unit_status', 'occupancy_status', 'occupancy status', 'vacancy_status'],
  amount:          ['payment_amount', 'payment amount', 'value', 'sum', 'total'],
  paymentDate:     ['payment_date', 'paymentdate', 'payment date', 'date', 'transaction_date', 'date_paid'],
  tenantRef:       ['tenant', 'tenant_id', 'tenantid', 'tenant_email', 'tenant email', 'tenant_ref'],
  paymentType:     ['payment_type', 'paymenttype', 'payment type', 'method', 'payment_method'],
  referenceNumber: ['reference_number', 'referencenumber', 'reference number', 'ref', 'ref_number', 'transaction_ref', 'transaction_id'],
  startDate:       ['start_date', 'startdate', 'start date', 'lease_start', 'lease start', 'commencement_date'],
  endDate:         ['end_date', 'enddate', 'end date', 'lease_end', 'lease end', 'expiry_date', 'expiration_date'],
  securityDeposit: ['security_deposit', 'securitydeposit', 'security deposit', 'deposit'],
};

/**
 * Build a lookup: normalised alias → canonical field name.
 * Only includes aliases for fields present in the given schema (prevents
 * cross-type ambiguity, e.g. "unit" meaning unitRef vs unitNumber).
 */
function buildAliasLookup(schemaFields: CanonicalField[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const field of schemaFields) {
    // Canonical name itself always matches
    lookup.set(field.name.toLowerCase(), field.name);
    for (const alias of CANONICAL_FIELD_ALIASES[field.name] ?? []) {
      lookup.set(alias.toLowerCase(), field.name);
    }
  }
  return lookup;
}

// --- Public API ---

export function getSchemaFields(ingestionType: CsvIngestionType): CanonicalField[] {
  return SCHEMAS[ingestionType] ?? [];
}

/**
 * Auto-detect a column mapping from raw CSV headers.
 * Returns the mapping (csvHeader → canonicalField | null) and any required
 * canonical fields that could not be matched.
 */
export function autoDetectMapping(
  headers: string[],
  ingestionType: CsvIngestionType
): MappingResult {
  const schemaFields = SCHEMAS[ingestionType] ?? [];
  const aliasLookup = buildAliasLookup(schemaFields);
  const mapping: ColumnMapping = {};
  const mappedCanonicals = new Set<string>();

  for (const header of headers) {
    const canonical = aliasLookup.get(header.trim().toLowerCase()) ?? null;
    if (canonical && !mappedCanonicals.has(canonical)) {
      // First CSV column to match a canonical field wins
      mapping[header] = canonical;
      mappedCanonicals.add(canonical);
    } else {
      mapping[header] = null;
    }
  }

  const missingRequired = schemaFields
    .filter((f) => f.required && !mappedCanonicals.has(f.name))
    .map((f) => f.name);

  return { mapping, missingRequired };
}

/**
 * Validate that a submitted mapping covers all required fields for the
 * ingestion type. Returns whether it is valid and which required fields
 * are still unmapped.
 */
export function validateMapping(
  mapping: ColumnMapping,
  ingestionType: CsvIngestionType
): { valid: boolean; missingRequired: string[] } {
  const schemaFields = SCHEMAS[ingestionType] ?? [];
  const mappedCanonicals = new Set(
    Object.values(mapping).filter((v): v is string => v !== null && v !== '')
  );
  const missingRequired = schemaFields
    .filter((f) => f.required && !mappedCanonicals.has(f.name))
    .map((f) => f.name);

  return { valid: missingRequired.length === 0, missingRequired };
}
