export const DEFAULT_COMMUNITY_STAKEHOLDER_TYPE = 'MUNICIPALITY_CITY_AGENCY' as const;

export const COMMUNITY_STAKEHOLDER_TYPE_OPTIONS = [
  {
    key: 'MUNICIPALITY_CITY_AGENCY',
    label: 'Municipality / City Agency',
    description: 'City or municipal agency overseeing housing and community programs',
  },
  {
    key: 'HOUSING_AUTHORITY',
    label: 'Housing Authority',
    description: 'Manages or oversees public or workforce housing',
  },
  {
    key: 'LAND_AUTHORITY',
    label: 'Land Authority',
    description: 'Focused on land stewardship, affordability, and redevelopment',
  },
  {
    key: 'UNIVERSITY_SCHOOL',
    label: 'University / School',
    description: 'Research, housing partnerships, or institutional redevelopment',
  },
  {
    key: 'FAITH_BASED_ORGANIZATION',
    label: 'Faith-Based Organization',
    description: 'Faith-aligned community housing or development partner',
  },
  {
    key: 'NONPROFIT',
    label: 'Nonprofit',
    description: 'Mission-driven nonprofit community stakeholder',
  },
  {
    key: 'OTHER',
    label: 'Other',
    description: 'Other community or mission-aligned stakeholder',
  },
] as const;

export type CommunityStakeholderTypeKey =
  (typeof COMMUNITY_STAKEHOLDER_TYPE_OPTIONS)[number]['key'];

const LEGACY_STAKEHOLDER_TYPE_ALIASES: Record<string, CommunityStakeholderTypeKey> = {
  municipality: 'MUNICIPALITY_CITY_AGENCY',
  'housing-authority': 'HOUSING_AUTHORITY',
  'land-authority': 'LAND_AUTHORITY',
  university: 'UNIVERSITY_SCHOOL',
  'faith-based': 'FAITH_BASED_ORGANIZATION',
  nonprofit: 'NONPROFIT',
  other: 'OTHER',
  ECONOMIC_DEVELOPMENT_OFFICE: 'MUNICIPALITY_CITY_AGENCY',
  COMMUNITY_LAND_TRUST: 'LAND_AUTHORITY',
  PUBLIC_UNIVERSITY_OR_INSTITUTION: 'UNIVERSITY_SCHOOL',
  OTHER_PUBLIC_AGENCY: 'OTHER',
};

export function getCommunityStakeholderTypeOption(key: CommunityStakeholderTypeKey) {
  return COMMUNITY_STAKEHOLDER_TYPE_OPTIONS.find((option) => option.key === key);
}

export function getCommunityStakeholderTypeLabel(
  key: CommunityStakeholderTypeKey | string | null | undefined
): string {
  const resolved = resolveCommunityStakeholderType(key);
  return getCommunityStakeholderTypeOption(resolved)?.label ?? 'Municipality / City Agency';
}

export function resolveCommunityStakeholderType(
  value: unknown
): CommunityStakeholderTypeKey {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_COMMUNITY_STAKEHOLDER_TYPE;
  }

  const rawValue = value.trim();
  const aliasMatch = LEGACY_STAKEHOLDER_TYPE_ALIASES[rawValue];
  if (aliasMatch) {
    return aliasMatch;
  }

  const exactOption = COMMUNITY_STAKEHOLDER_TYPE_OPTIONS.find(
    (option) => option.key === rawValue
  );
  if (exactOption) {
    return exactOption.key;
  }

  const normalizedValue = rawValue
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\/_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const labelMatch = COMMUNITY_STAKEHOLDER_TYPE_OPTIONS.find((option) => {
    const optionLabel = option.label
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[\/_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return optionLabel === normalizedValue;
  });

  if (labelMatch) {
    return labelMatch.key;
  }

  return DEFAULT_COMMUNITY_STAKEHOLDER_TYPE;
}

export function isKnownCommunityStakeholderType(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const rawValue = value.trim();
  if (LEGACY_STAKEHOLDER_TYPE_ALIASES[rawValue]) {
    return true;
  }

  if (COMMUNITY_STAKEHOLDER_TYPE_OPTIONS.some((option) => option.key === rawValue)) {
    return true;
  }

  const normalizedValue = rawValue
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\/_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return COMMUNITY_STAKEHOLDER_TYPE_OPTIONS.some((option) => {
    const optionLabel = option.label
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[\/_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return optionLabel === normalizedValue;
  });
}

export function normalizeCommunityStakeholderType(
  value: unknown
): CommunityStakeholderTypeKey {
  if (!isKnownCommunityStakeholderType(value)) {
    throw new Error('stakeholderType is invalid');
  }

  return resolveCommunityStakeholderType(value);
}

export function buildCommunityStakeholderProfileResponse(
  profile?: {
    organizationName?: string;
    stakeholderType?: string;
    titleRoleAtOrganization?: string;
    cityRegionServed?: string;
  } | null,
  phone?: string | null
) {
  const stakeholderType = resolveCommunityStakeholderType(
    profile?.stakeholderType ?? DEFAULT_COMMUNITY_STAKEHOLDER_TYPE
  );

  return {
    organizationName: profile?.organizationName ?? null,
    stakeholderType,
    stakeholderTypeLabel: getCommunityStakeholderTypeLabel(stakeholderType),
    titleRoleAtOrganization: profile?.titleRoleAtOrganization ?? null,
    cityRegionServed: profile?.cityRegionServed ?? null,
    phoneNumber: phone?.trim() || null,
  };
}
