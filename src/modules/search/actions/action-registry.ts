export interface Action {
  id: string;
  label: string;
  description: string;
  route: string;
  category: string;
  // Additional trigger phrases beyond what's in the label
  keywords: string[];
  roles: string[];
}

export const ACTION_REGISTRY: Action[] = [
  // ── Dashboard ────────────────────────────────────────────────────────────
  {
    id: 'nav.dashboard',
    label: 'Go to Dashboard',
    description: 'Open your main dashboard',
    route: '/dashboard',
    category: 'Navigation',
    keywords: ['home', 'overview', 'main', 'start'],
    roles: ['landlord', 'tenant', 'investor', 'community_stakeholder', 'admin'],
  },

  // ── Properties ───────────────────────────────────────────────────────────
  {
    id: 'property.list',
    label: 'View Properties',
    description: 'Browse your property portfolio',
    route: '/properties',
    category: 'Properties',
    keywords: ['list properties', 'all properties', 'my properties', 'portfolio'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'property.create',
    label: 'Add a Property',
    description: 'Register a new property',
    route: '/properties/new',
    category: 'Properties',
    keywords: ['create property', 'new property', 'add property', 'register property'],
    roles: ['landlord', 'admin'],
  },

  // ── Units ────────────────────────────────────────────────────────────────
  {
    id: 'unit.list',
    label: 'View Units',
    description: 'Browse all units across your properties',
    route: '/landlord/units',
    category: 'Units',
    keywords: ['list units', 'all units', 'my units'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'unit.create',
    label: 'Add a Unit',
    description: 'Add a new unit to a property',
    route: '/landlord/units/new',
    category: 'Units',
    keywords: ['create unit', 'new unit', 'register unit'],
    roles: ['landlord', 'admin'],
  },

  // ── Tenants ──────────────────────────────────────────────────────────────
  {
    id: 'tenant.list',
    label: 'View Tenants',
    description: 'See all tenants in your properties',
    route: '/landlord/tenants',
    category: 'Tenants',
    keywords: ['list tenants', 'all tenants', 'my tenants', 'renters'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'tenant.invite',
    label: 'Invite a Tenant',
    description: 'Send an invitation to a new tenant',
    route: '/landlord/tenants/invite',
    category: 'Tenants',
    keywords: ['add tenant', 'new tenant', 'invite renter', 'invite user', 'send invite'],
    roles: ['landlord', 'admin'],
  },

  // ── Tenancies ────────────────────────────────────────────────────────────
  {
    id: 'tenancy.create',
    label: 'Assign Unit to Tenant',
    description: 'Create a new tenancy and assign a unit',
    route: '/landlord/tenancies/new',
    category: 'Tenancies',
    keywords: ['create tenancy', 'new lease', 'assign unit', 'new tenancy', 'create lease'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'tenancy.list',
    label: 'View Tenancies',
    description: 'See all active and historical leases',
    route: '/landlord/tenancies',
    category: 'Tenancies',
    keywords: ['list tenancies', 'all leases', 'active leases', 'view leases'],
    roles: ['landlord', 'admin'],
  },

  // ── Credits / Ledger ─────────────────────────────────────────────────────
  {
    id: 'credits.landlord',
    label: 'Manage Ownership Credits',
    description: 'Issue and manage tenant ownership credits',
    route: '/landlord/credits',
    category: 'Credits',
    keywords: ['issue credits', 'credit balance', 'ownership credits', 'equity credits', 'ledger'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'credits.tenant',
    label: 'View My Ownership Credits',
    description: 'Check your ownership credit balance',
    route: '/tenant/credits',
    category: 'Credits',
    keywords: ['my credits', 'credit balance', 'ownership balance', 'my equity'],
    roles: ['tenant'],
  },

  // ── Campaigns / Rewards ──────────────────────────────────────────────────
  {
    id: 'campaign.create',
    label: 'Create Rewards Campaign',
    description: 'Launch a new rewards campaign for tenants',
    route: '/landlord/campaigns/new',
    category: 'Campaigns',
    keywords: ['new campaign', 'add campaign', 'launch campaign', 'create reward', 'new reward'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'campaign.list',
    label: 'View Campaigns',
    description: 'See all active and past campaigns',
    route: '/landlord/campaigns',
    category: 'Campaigns',
    keywords: ['list campaigns', 'all campaigns', 'my campaigns', 'rewards program'],
    roles: ['landlord', 'admin'],
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  {
    id: 'payment.collect',
    label: 'Collect Payments',
    description: 'View and collect tenant rent payments',
    route: '/landlord/payments',
    category: 'Payments',
    keywords: ['receive payment', 'rent collection', 'payment history', 'invoices'],
    roles: ['landlord', 'admin'],
  },
  {
    id: 'payment.pay',
    label: 'Pay Rent',
    description: 'Make your monthly rent payment',
    route: '/tenant/payments',
    category: 'Payments',
    keywords: ['pay rent', 'make payment', 'rent due', 'submit payment'],
    roles: ['tenant'],
  },
  {
    id: 'payment.history',
    label: 'View Payment History',
    description: 'Review past payments and receipts',
    route: '/tenant/payments/history',
    category: 'Payments',
    keywords: ['payment history', 'past payments', 'receipts', 'transaction history'],
    roles: ['tenant'],
  },

  // ── Maintenance ──────────────────────────────────────────────────────────
  {
    id: 'maintenance.submit',
    label: 'Submit Maintenance Request',
    description: 'Report a maintenance issue in your unit',
    route: '/tenant/maintenance/new',
    category: 'Maintenance',
    keywords: ['report issue', 'request repair', 'maintenance ticket', 'fix something', 'broken'],
    roles: ['tenant'],
  },
  {
    id: 'maintenance.tenant',
    label: 'View My Maintenance Requests',
    description: 'Track the status of your maintenance requests',
    route: '/tenant/maintenance',
    category: 'Maintenance',
    keywords: ['my maintenance', 'repair status', 'ticket status', 'open tickets'],
    roles: ['tenant'],
  },
  {
    id: 'maintenance.landlord',
    label: 'View Maintenance Tickets',
    description: 'Review and respond to tenant maintenance requests',
    route: '/landlord/maintenance',
    category: 'Maintenance',
    keywords: ['open tickets', 'tenant issues', 'repair requests', 'maintenance queue'],
    roles: ['landlord', 'admin'],
  },

  // ── Documents ────────────────────────────────────────────────────────────
  {
    id: 'docs.upload',
    label: 'Upload Document',
    description: 'Upload a file or document',
    route: '/docs/upload',
    category: 'Documents',
    keywords: ['attach file', 'add document', 'upload file', 'submit document', 'add file'],
    roles: ['landlord', 'tenant', 'admin'],
  },
  {
    id: 'docs.list',
    label: 'View Documents',
    description: 'Browse your document library',
    route: '/docs',
    category: 'Documents',
    keywords: ['my documents', 'file library', 'all documents', 'document list'],
    roles: ['landlord', 'tenant', 'investor', 'admin'],
  },

  // ── TEPA ─────────────────────────────────────────────────────────────────
  {
    id: 'tepa.tenant',
    label: 'View TEPA Agreement',
    description: 'Review your Tenant Equity Participation Agreement',
    route: '/tenant/tepa',
    category: 'TEPA',
    keywords: ['equity agreement', 'participation agreement', 'sign tepa', 'tepa status'],
    roles: ['tenant'],
  },
  {
    id: 'tepa.landlord',
    label: 'Manage TEPA Agreements',
    description: 'View and manage tenant equity agreements',
    route: '/landlord/tepa',
    category: 'TEPA',
    keywords: ['tepa list', 'equity agreements', 'participation agreements', 'tenant equity'],
    roles: ['landlord', 'admin'],
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  {
    id: 'reports.view',
    label: 'View Reports',
    description: 'Open the analytics and reporting center',
    route: '/reports',
    category: 'Reports',
    keywords: ['analytics', 'data', 'export', 'occupancy report', 'income report'],
    roles: ['landlord', 'investor', 'community_stakeholder', 'admin'],
  },

  // ── Chat ─────────────────────────────────────────────────────────────────
  {
    id: 'chat.open',
    label: 'View Messages',
    description: 'Open your conversations',
    route: '/chat',
    category: 'Chat',
    keywords: ['messages', 'conversations', 'inbox', 'contact', 'message landlord', 'message tenant'],
    roles: ['landlord', 'tenant', 'admin'],
  },

  // ── Ask AI ───────────────────────────────────────────────────────────────
  {
    id: 'ai.ask',
    label: 'Ask AI',
    description: 'Get answers from the KeyPath AI assistant',
    route: '/ask-ai',
    category: 'AI',
    keywords: ['ask a question', 'ai chat', 'help me', 'knowledge base', 'faq', 'assistant'],
    roles: ['landlord', 'tenant', 'investor', 'community_stakeholder', 'admin'],
  },

  // ── CSV Import ───────────────────────────────────────────────────────────
  {
    id: 'csv.import',
    label: 'Import Tenant Data via CSV',
    description: 'Bulk upload tenants or units from a CSV file',
    route: '/landlord/csv',
    category: 'Import',
    keywords: ['upload csv', 'bulk import', 'import tenants', 'import units', 'spreadsheet'],
    roles: ['landlord', 'admin'],
  },

  // ── Compliance ───────────────────────────────────────────────────────────
  {
    id: 'compliance.view',
    label: 'Compliance Center',
    description: 'Review compliance status and requirements',
    route: '/compliance',
    category: 'Compliance',
    keywords: ['legal', 'regulations', 'compliance check', 'requirements'],
    roles: ['landlord', 'admin'],
  },

  // ── Investor ─────────────────────────────────────────────────────────────
  {
    id: 'investor.portfolio',
    label: 'View My Portfolio',
    description: 'Review your investment portfolio and token holdings',
    route: '/investor/portfolio',
    category: 'Investments',
    keywords: ['investments', 'tokens', 'holdings', 'my investments', 'portfolio overview'],
    roles: ['investor'],
  },
  {
    id: 'investor.cap-table',
    label: 'View Cap Table',
    description: 'See the full capitalization table',
    route: '/investor/cap-table',
    category: 'Investments',
    keywords: ['capitalization', 'ownership table', 'token distribution', 'cap table'],
    roles: ['investor', 'admin'],
  },

  // ── Community ────────────────────────────────────────────────────────────
  {
    id: 'community.projects',
    label: 'View Projects',
    description: 'Browse community projects and assigned properties',
    route: '/community/projects',
    category: 'Community',
    keywords: ['my projects', 'assigned properties', 'community properties'],
    roles: ['community_stakeholder'],
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  {
    id: 'settings.profile',
    label: 'Account Settings',
    description: 'Update your profile and preferences',
    route: '/settings',
    category: 'Settings',
    keywords: ['edit profile', 'my account', 'profile settings', 'preferences', 'change password'],
    roles: ['landlord', 'tenant', 'investor', 'community_stakeholder', 'admin'],
  },
  {
    id: 'settings.org',
    label: 'Organization Settings',
    description: 'Manage your organization profile',
    route: '/settings/organization',
    category: 'Settings',
    keywords: ['edit org', 'company settings', 'organization profile'],
    roles: ['landlord', 'admin'],
  },

  // ── Admin ────────────────────────────────────────────────────────────────
  {
    id: 'admin.users',
    label: 'Manage Users',
    description: 'View, suspend, or reactivate user accounts',
    route: '/admin/users',
    category: 'Admin',
    keywords: ['user management', 'all users', 'suspend user', 'view users'],
    roles: ['admin'],
  },
  {
    id: 'admin.audit',
    label: 'View Audit Logs',
    description: 'Review system-wide activity and events',
    route: '/admin/audit',
    category: 'Admin',
    keywords: ['activity log', 'event log', 'audit trail', 'system logs'],
    roles: ['admin'],
  },
  {
    id: 'admin.search-index',
    label: 'Rebuild Search Index',
    description: 'Trigger a full rebuild of the search index',
    route: '/admin/search-index',
    category: 'Admin',
    keywords: ['rebuild index', 'reindex', 'search rebuild'],
    roles: ['admin'],
  },

  // ── Help ─────────────────────────────────────────────────────────────────
  {
    id: 'help.support',
    label: 'Help & Support',
    description: 'Get help or contact support',
    route: '/help',
    category: 'Help',
    keywords: ['faq', 'contact support', 'get help', 'documentation', 'how to'],
    roles: ['landlord', 'tenant', 'investor', 'community_stakeholder', 'admin'],
  },
];
