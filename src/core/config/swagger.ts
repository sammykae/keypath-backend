import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

// Codex: normalized shared schemas so Swagger examples match runtime responses.
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KeyPath Backend API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for KeyPath Backend - Property tokenization and equity management platform',
      contact: {
        name: 'KeyPath API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
      {
        url: 'https://api.keypath.com',
        description: 'Production server',
      },
    ],
    paths: {
      '/api/ledger/entry': {
        post: {
          summary: 'Create token ledger entry',
          tags: ['Ledger'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['property_id', 'tenant_id', 'type', 'tokens', 'source'],
                  properties: {
                    property_id: { type: 'string' },
                    tenant_id: { type: 'string' },
                    type: { type: 'string', enum: ['accrual', 'purchase', 'adjustment', 'forfeit'] },
                    tokens: { type: 'number' },
                    value: { type: 'number' },
                    timestamp: { type: 'string', format: 'date-time' },
                    source: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Ledger entry created' },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'TEPA guard violation' },
            '404': { description: 'Property not found' },
            '409': { description: 'Duplicate entry detected' },
          },
        },
      },
      '/api/ledger/property/{id}': {
        get: {
          summary: 'Get property token ledger history',
          tags: ['Ledger'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Property ledger entries and derived balance' },
            '400': { description: 'Invalid property id' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/ledger/{tenant_id}': {
        get: {
          summary: 'Get tenant token ledger history',
          tags: ['Ledger'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: 'path', name: 'tenant_id', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Tenant ledger entries and derived balance' },
            '400': { description: 'Invalid tenant id' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: {
              type: 'string',
              description: 'Stable machine-readable error code',
              example: 'FORBIDDEN',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Insufficient permissions',
            },
            details: {
              nullable: true,
              oneOf: [{ type: 'object' }, { type: 'array' }, { type: 'string' }],
            },
          },
        },
        ApiErrorResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: false },
            requestId: { type: 'string', example: '92e272ca-b7a2-4b95-a2bb-9f84f92f7a1f' },
            data: { nullable: true, example: null },
            error: { $ref: '#/components/schemas/ApiError' },
          },
        },
        Error: {
          $ref: '#/components/schemas/ApiError',
        },
        ApiMessageData: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', example: 'Operation completed successfully' },
          },
        },
        MessageResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/ApiMessageData' },
            error: { nullable: true, example: null },
          },
        },
        HealthData: {
          type: 'object',
          required: ['status', 'version', 'uptimeSeconds', 'timestamp', 'environment'],
          properties: {
            status: { type: 'string', example: 'ok' },
            version: { type: 'string', example: '1.0.0' },
            uptimeSeconds: { type: 'number', example: 174 },
            timestamp: { type: 'string', format: 'date-time' },
            environment: { type: 'string', example: 'development' },
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/HealthData' },
            error: { nullable: true, example: null },
          },
        },
        AuthRegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'role'],
          properties: {
            email: { type: 'string', format: 'email', example: 'tenant@example.com' },
            password: { type: 'string', minLength: 8, example: 'strongPassword123' },
            role: {
              type: 'string',
              enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'COMMUNITY_STAKEHOLDER', 'INVESTOR', 'ADMIN'],
            },
            firstName: { type: 'string', example: 'Amina' },
            lastName: { type: 'string', example: 'Ade' },
            phone: { type: 'string', example: '+1-555-0100' },
            onboardingToken: {
              type: 'string',
              description:
                'Required for LANDLORD, TENANT, and COMMUNITY registration via admin-generated onboarding invite link',
            },
          },
        },
        AuthLoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'tenant@example.com' },
            password: { type: 'string', example: 'strongPassword123' },
          },
        },
        AuthSessionUser: {
          type: 'object',
          required: ['id', 'email', 'role', 'status'],
          properties: {
            id: { type: 'string', example: '66f9bc8d34ce97524722e6c1' },
            email: { type: 'string', format: 'email' },
            role: {
              type: 'string',
              enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'INVESTOR', 'ADMIN'],
            },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'SUSPENDED', 'PENDING'],
            },
          },
        },
        AuthSessionData: {
          type: 'object',
          required: ['token', 'user'],
          properties: {
            token: { type: 'string', description: 'JWT bearer token' },
            user: { $ref: '#/components/schemas/AuthSessionUser' },
          },
        },
        AuthSessionResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/AuthSessionData' },
            error: { nullable: true, example: null },
          },
        },
        AuthOrgContextMembership: {
          type: 'object',
          required: ['orgId', 'roleInOrg', 'status'],
          properties: {
            orgId: { type: 'string', example: '66f9bc8d34ce97524722e6c2' },
            roleInOrg: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
            status: { type: 'string', enum: ['invited', 'active', 'disabled'] },
          },
        },
        AuthMeData: {
          type: 'object',
          required: ['id', 'email', 'role', 'status', 'orgContext'],
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: {
              type: 'string',
              enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'INVESTOR', 'ADMIN'],
            },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'SUSPENDED', 'PENDING'],
            },
            orgContext: {
              type: 'object',
              required: ['primaryOrgId', 'memberships'],
              properties: {
                primaryOrgId: {
                  type: 'string',
                  nullable: true,
                },
                memberships: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AuthOrgContextMembership' },
                },
              },
            },
          },
        },
        AuthMeResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/AuthMeData' },
            error: { nullable: true, example: null },
          },
        },
        OnboardingDocument: {
          type: 'object',
          required: [
            'documentId',
            'stepKey',
            'documentType',
            'fileUrl',
            'status',
            'uploadedAt',
          ],
          properties: {
            documentId: { type: 'string', example: 'e32a1cf1-0562-43b9-abeb-bdf59826e2af' },
            stepKey: { type: 'string', example: 'profile_complete' },
            documentType: { type: 'string', example: 'government_id' },
            fileName: { type: 'string', nullable: true, example: 'id-front.png' },
            fileUrl: { type: 'string', format: 'uri' },
            status: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED'] },
            uploadedAt: { type: 'string', format: 'date-time' },
            reviewedByUserId: { type: 'string', nullable: true },
            reviewedAt: { type: 'string', format: 'date-time', nullable: true },
            rejectionReason: { type: 'string', nullable: true },
          },
        },
        OnboardingStatusData: {
          type: 'object',
          required: ['role', 'completedSteps', 'requiredSteps', 'status', 'isReady', 'documents'],
          properties: {
            role: {
              type: 'string',
              enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'INVESTOR', 'ADMIN'],
            },
            completedSteps: {
              type: 'array',
              items: { type: 'string' },
            },
            requiredSteps: {
              type: 'array',
              items: { type: 'string' },
            },
            status: { type: 'string', enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'] },
            isReady: { type: 'boolean' },
            documents: {
              type: 'array',
              items: { $ref: '#/components/schemas/OnboardingDocument' },
            },
          },
        },
        OnboardingStatusResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/OnboardingStatusData' },
            error: { nullable: true, example: null },
          },
        },
        OnboardingSubmitStepRequest: {
          type: 'object',
          required: ['stepKey'],
          properties: {
            stepKey: { type: 'string', example: 'profile_complete' },
            payload: {
              type: 'object',
              additionalProperties: true,
              example: {
                firstName: 'Amina',
                lastName: 'Ade',
                address: '123 Main Street, Houston, TX',
              },
            },
          },
        },
        OnboardingSubmitStepData: {
          type: 'object',
          required: ['message', 'stepKey', 'status'],
          properties: {
            message: { type: 'string', example: 'Onboarding step submitted successfully' },
            stepKey: { type: 'string', example: 'profile_complete' },
            status: { $ref: '#/components/schemas/OnboardingStatusData' },
          },
        },
        OnboardingSubmitStepResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/OnboardingSubmitStepData' },
            error: { nullable: true, example: null },
          },
        },
        OnboardingUploadDocRequest: {
          type: 'object',
          required: ['stepKey', 'documentType', 'fileUrl'],
          properties: {
            stepKey: { type: 'string', example: 'profile_complete' },
            documentType: { type: 'string', example: 'proof_of_address' },
            fileName: { type: 'string', example: 'utility-bill.pdf' },
            fileUrl: {
              type: 'string',
              format: 'uri',
              example: 'https://storage.example.com/uploads/utility-bill.pdf',
            },
          },
        },
        OnboardingUploadDocData: {
          type: 'object',
          required: ['message', 'document'],
          properties: {
            message: { type: 'string', example: 'Onboarding document uploaded successfully' },
            document: { $ref: '#/components/schemas/OnboardingDocument' },
          },
        },
        OnboardingUploadDocResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/OnboardingUploadDocData' },
            error: { nullable: true, example: null },
          },
        },
        OnboardingVerifyDocRequest: {
          type: 'object',
          required: ['userId', 'documentId', 'decision'],
          properties: {
            userId: { type: 'string', example: '66f9bc8d34ce97524722e6c1' },
            documentId: { type: 'string', example: 'e32a1cf1-0562-43b9-abeb-bdf59826e2af' },
            decision: { type: 'string', enum: ['VERIFIED', 'REJECTED'] },
            rejectionReason: { type: 'string', nullable: true },
          },
        },
        OnboardingVerifyDocData: {
          type: 'object',
          required: ['message', 'document'],
          properties: {
            message: { type: 'string', example: 'Onboarding document verification updated' },
            document: {
              type: 'object',
              required: ['documentId', 'status'],
              properties: {
                documentId: { type: 'string' },
                status: { type: 'string', enum: ['VERIFIED', 'REJECTED'] },
                reviewedByUserId: { type: 'string', nullable: true },
                reviewedAt: { type: 'string', format: 'date-time', nullable: true },
                rejectionReason: { type: 'string', nullable: true },
              },
            },
          },
        },
        OnboardingVerifyDocResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/OnboardingVerifyDocData' },
            error: { nullable: true, example: null },
          },
        },
        CreateOrganizationRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Acme Properties LLC' },
            type: {
              type: 'string',
              enum: ['LANDLORD_ORG', 'COMMUNITY_ORG', 'INVESTOR_ORG'],
            },
          },
        },
        Organization: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: ['LANDLORD_ORG', 'COMMUNITY_ORG', 'INVESTOR_ORG'],
            },
            primaryContactUserId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        OrganizationDetails: {
          type: 'object',
          required: ['id', 'name', 'createdAt'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: ['LANDLORD_ORG', 'COMMUNITY_ORG', 'INVESTOR_ORG'],
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        OrganizationMembershipSummary: {
          type: 'object',
          required: ['org', 'roleInOrg'],
          properties: {
            org: { $ref: '#/components/schemas/Organization' },
            roleInOrg: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
          },
        },
        MembershipUserRef: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: {
              type: 'string',
              enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'INVESTOR', 'ADMIN'],
            },
          },
        },
        Membership: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            orgId: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Organization' }] },
            userId: {
              oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/MembershipUserRef' }],
            },
            roleInOrg: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
            status: { type: 'string', enum: ['invited', 'active', 'disabled'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AddOrganizationMemberRequest: {
          type: 'object',
          required: ['userId', 'roleInOrg'],
          properties: {
            userId: { type: 'string', example: '66f9bc8d34ce97524722e6c1' },
            roleInOrg: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
          },
        },
        UpdateOrganizationMemberRequest: {
          type: 'object',
          properties: {
            roleInOrg: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
            status: { type: 'string', enum: ['invited', 'active', 'disabled'] },
          },
        },
        OrganizationResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/Organization' },
            error: { nullable: true, example: null },
          },
        },
        OrganizationDetailsResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/OrganizationDetails' },
            error: { nullable: true, example: null },
          },
        },
        OrganizationMembershipSummaryListResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/OrganizationMembershipSummary' },
            },
            error: { nullable: true, example: null },
          },
        },
        MembershipResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/Membership' },
            error: { nullable: true, example: null },
          },
        },
        MembershipListResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/Membership' },
            },
            error: { nullable: true, example: null },
          },
        },
        TepaOptInRequest: {
          type: 'object',
          required: ['unitId', 'consentVersion', 'acceptedAt'],
          properties: {
            unitId: {
              type: 'string',
              description: 'Mongo ObjectId of the unit',
              example: '66f9bc8d34ce97524722e6a1',
            },
            consentVersion: { type: 'string', minLength: 2, maxLength: 32, example: 'v1.0' },
            acceptedAt: { type: 'string', format: 'date-time' },
          },
        },
        TepaEnrollment: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            tenantUserId: { type: 'string' },
            unitId: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE', 'REVOKED'] },
            effectiveDate: { type: 'string', format: 'date-time' },
            consentVersion: { type: 'string' },
            acceptedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        TepaEnrollmentResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/TepaEnrollment' },
            error: { nullable: true, example: null },
          },
        },
        DemoSeedData: {
          type: 'object',
          required: ['message', 'orgId'],
          properties: {
            message: { type: 'string', example: 'Demo data seeded successfully' },
            orgId: { type: 'string' },
          },
        },
        DemoSeedResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/DemoSeedData' },
            error: { nullable: true, example: null },
          },
        },
        Property: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            orgId: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                line1: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                postalCode: { type: 'string' },
                country: { type: 'string' },
              },
            },
            type: {
              type: 'string',
              enum: ['SFR', 'MF', 'BTR', 'Condo', 'Other'],
            },
            status: {
              type: 'string',
              enum: ['ONBOARDING', 'LIVE', 'PAUSED'],
            },
            tokenizedPct: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            email: { type: 'string' },
            role: {
              type: 'string',
              enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'INVESTOR', 'ADMIN'],
            },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'SUSPENDED', 'PENDING'],
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Token: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            propertyId: { type: 'string' },
            tokenId: { type: 'string' },
            ownerId: { type: 'string' },
            amount: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Unit: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            propertyId: { type: 'string' },
            unitNumber: { type: 'string' },
            type: {
              type: 'string',
              enum: ['apartment', 'flat', 'townhome', 'single_family', 'adu', 'condo'],
            },
            bedrooms: { type: 'number' },
            bathrooms: { type: 'number' },
            sqft: { type: 'number' },
            marketRent: { type: 'number' },
            depositRequired: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Tenant: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            dob: { type: 'string', format: 'date' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Offer: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            propertyId: { type: 'string' },
            unitId: { type: 'string' },
            tenantId: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Portfolio: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            properties: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AIChatRequest: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              description: 'User message/question',
            },
            sessionId: {
              type: 'string',
              description: 'Optional session ID for conversation continuity',
            },
          },
        },
        AIChatResponse: {
          type: 'object',
          properties: {
            response: {
              type: 'string',
              description: 'AI generated response',
            },
            sessionId: {
              type: 'string',
              description: 'Session ID for conversation continuity',
            },
          },
        },
        CampaignCreateBody: {
          type: 'object',
          required: ['orgId', 'name', 'triggerEvent', 'creditAmount'],
          properties: {
            orgId: {
              type: 'string',
              description: 'Organization Mongo ObjectId; user must be OWNER or ADMIN of this org',
            },
            name: { type: 'string', description: 'Campaign display name' },
            description: { type: 'string' },
            goal: { type: 'string', description: 'UI goal line (e.g. reward on-time rent)' },
            startsAt: { type: 'string', format: 'date-time', description: 'Program window start' },
            endsAt: { type: 'string', format: 'date-time', description: 'Must be >= startsAt if both set' },
            budgetUsd: { type: 'number', minimum: 0, description: 'Display budget in USD' },
            budgetTokenCap: {
              type: 'number',
              minimum: 0,
              description: 'Max total tokens issued for this campaign (ledger sum cap)',
            },
            suggestionHeadline: { type: 'string' },
            suggestionDetail: { type: 'string' },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'PAUSED', 'ENDED'],
              default: 'ACTIVE',
            },
            triggerEvent: {
              type: 'string',
              enum: ['TENANCY_CREATED', 'RENT_PAYMENT_PAID'],
              description: 'Domain event that triggers automatic credit issuance',
            },
            creditAmount: {
              type: 'number',
              minimum: 0.0001,
              description: 'Tokens credited per trigger (must be positive)',
            },
            propertyId: { type: 'string', description: 'Optional scope — Mongo ObjectId' },
            unitId: { type: 'string', description: 'Optional scope — Mongo ObjectId' },
          },
        },
        CampaignPatchBody: {
          type: 'object',
          required: ['orgId'],
          minProperties: 2,
          description: 'orgId required for access check; at least one other field to update',
          properties: {
            orgId: {
              type: 'string',
              description: 'Organization Mongo ObjectId; user must be OWNER or ADMIN of this org',
            },
            name: { type: 'string' },
            description: { type: 'string' },
            goal: { type: 'string', nullable: true },
            startsAt: { type: 'string', format: 'date-time', nullable: true },
            endsAt: { type: 'string', format: 'date-time', nullable: true },
            budgetUsd: { type: 'number', minimum: 0, nullable: true },
            budgetTokenCap: { type: 'number', minimum: 0, nullable: true },
            suggestionHeadline: { type: 'string', nullable: true },
            suggestionDetail: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ENDED'] },
            triggerEvent: {
              type: 'string',
              enum: ['TENANCY_CREATED', 'RENT_PAYMENT_PAID'],
            },
            creditAmount: { type: 'number', minimum: 0.0001 },
            propertyId: { type: 'string', nullable: true },
            unitId: { type: 'string', nullable: true },
          },
        },
        CsvFileIssue: {
          type: 'object',
          required: ['code', 'message', 'row'],
          properties: {
            code: { type: 'string', example: 'REQUIRED_VALUE' },
            message: { type: 'string' },
            row: { type: 'integer', example: 2 },
            field: { type: 'string' },
            value: { type: 'string' },
          },
        },
        CsvColumnRule: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['string', 'email', 'number', 'integer', 'date_iso', 'objectid'],
            },
            required: { type: 'boolean' },
          },
        },
        CsvImportSchema: {
          type: 'object',
          required: ['required'],
          properties: {
            required: {
              type: 'array',
              items: { type: 'string' },
              example: ['id', 'email'],
            },
            columns: {
              type: 'object',
              additionalProperties: { $ref: '#/components/schemas/CsvColumnRule' },
            },
            duplicateKeyColumns: { type: 'array', items: { type: 'string' } },
            duplicateEntireRow: { type: 'boolean', default: false },
            caseInsensitiveHeaders: { type: 'boolean', default: true },
            allowUnknownHeaders: { type: 'boolean', default: true },
          },
        },
        CsvValidateRequest: {
          type: 'object',
          required: ['csv', 'schema'],
          properties: {
            csv: { type: 'string', description: 'Raw CSV text' },
            schema: { $ref: '#/components/schemas/CsvImportSchema' },
          },
        },
        CsvDataRow: {
          type: 'object',
          description: 'Key = column name (lowercase if caseInsensitiveHeaders). Values are strings.',
          additionalProperties: { type: 'string' },
          example: { id: '1', email: 'valid@example.com' },
        },
        CsvValidationData: {
          type: 'object',
          required: [
            'validRows',
            'errors',
            'warnings',
            'totalDataRows',
            'headerRowNumber',
            'resolvedHeaders',
          ],
          properties: {
            validRows: { type: 'array', items: { $ref: '#/components/schemas/CsvDataRow' } },
            errors: { type: 'array', items: { $ref: '#/components/schemas/CsvFileIssue' } },
            warnings: { type: 'array', items: { $ref: '#/components/schemas/CsvFileIssue' } },
            totalDataRows: { type: 'integer' },
            headerRowNumber: { type: 'integer' },
            resolvedHeaders: { type: 'array', items: { type: 'string' } },
          },
          example: {
            validRows: [{ id: '1', email: 'valid@example.com' }],
            errors: [
              {
                code: 'INVALID_FORMAT',
                message: 'invalid email',
                row: 3,
                field: 'email',
                value: 'bad-email',
              },
            ],
            warnings: [],
            totalDataRows: 3,
            headerRowNumber: 1,
            resolvedHeaders: ['id', 'email'],
          },
        },
        CsvImportSummaryRequest: {
          type: 'object',
          required: ['totalDataRows'],
          description:
            'Same shape as the `data` object from `POST /api/csv/validate` (or paste the validate response `data` here).',
          properties: {
            validRows: { type: 'array', items: { $ref: '#/components/schemas/CsvDataRow' } },
            errors: { type: 'array', items: { $ref: '#/components/schemas/CsvFileIssue' } },
            warnings: { type: 'array', items: { $ref: '#/components/schemas/CsvFileIssue' } },
            totalDataRows: { type: 'integer', description: 'Number of data rows in the file (not including header)' },
            headerRowNumber: { type: 'integer' },
            resolvedHeaders: { type: 'array', items: { type: 'string' } },
          },
          example: {
            validRows: [
              { id: '1', email: 'valid@example.com' },
              { id: '3', email: 'dup@example.com' },
            ],
            errors: [
              {
                code: 'INVALID_FORMAT',
                message: 'invalid email',
                field: 'email',
                value: 'bad-email',
                row: 3,
              },
              {
                code: 'DUPLICATE',
                message: 'duplicate of row 4',
                value: 'dup@example.com',
                row: 5,
              },
            ],
            warnings: [],
            totalDataRows: 4,
            headerRowNumber: 1,
            resolvedHeaders: ['id', 'email'],
          },
        },
        CsvImportSummaryData: {
          type: 'object',
          properties: {
            totalRows: { type: 'integer' },
            valid: { type: 'integer' },
            invalidRowCount: { type: 'integer' },
            errorCount: { type: 'integer' },
            warningCount: { type: 'integer' },
            errors: { type: 'array', items: { $ref: '#/components/schemas/CsvFileIssue' } },
            warnings: { type: 'array', items: { $ref: '#/components/schemas/CsvFileIssue' } },
          },
        },
        CsvValidateApiResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/CsvValidationData' },
            error: { nullable: true, example: null },
          },
          example: {
            success: true,
            requestId: '3f1c8a00-0b2d-4a9e-8c11-d4e5f9a0b1c2',
            data: {
              validRows: [{ id: '1', email: 'valid@example.com' }],
              errors: [
                {
                  code: 'INVALID_FORMAT',
                  message: 'invalid email',
                  row: 3,
                  field: 'email',
                  value: 'bad-email',
                },
              ],
              warnings: [],
              totalDataRows: 3,
              headerRowNumber: 1,
              resolvedHeaders: ['id', 'email'],
            },
            error: null,
          },
        },
        CsvImportSummaryApiResponse: {
          type: 'object',
          required: ['success', 'requestId', 'data', 'error'],
          properties: {
            success: { type: 'boolean', example: true },
            requestId: { type: 'string' },
            data: { $ref: '#/components/schemas/CsvImportSummaryData' },
            error: { nullable: true, example: null },
          },
          example: {
            success: true,
            requestId: '7b2a9c00-1e4f-4a8c-9d2e-3f1a0b2c3d4e',
            data: {
              totalRows: 4,
              valid: 2,
              invalidRowCount: 2,
              errorCount: 2,
              warningCount: 0,
              errors: [
                {
                  code: 'INVALID_FORMAT',
                  message: 'invalid email',
                  field: 'email',
                  value: 'bad-email',
                  row: 3,
                },
                {
                  code: 'DUPLICATE',
                  message: 'duplicate of row 4',
                  value: 'dup@example.com',
                  row: 5,
                },
              ],
              warnings: [],
            },
            error: null,
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication and authorization endpoints' },
      { name: 'Properties', description: 'Property management endpoints' },
      { name: 'Units', description: 'Unit management endpoints' },
      { name: 'Tenants', description: 'Tenant management endpoints' },
      { name: 'Ledger', description: 'Credit ledger, ownership credits, and unified token ledger' },
      { name: 'Tokens', description: 'Token management endpoints' },
      { name: 'Tokenization', description: 'Tokenization and preview endpoints' },
      { name: 'Dashboard', description: 'Dashboard data endpoints' },
      { name: 'Marketplace', description: 'Marketplace and portfolio endpoints' },
      { name: 'Offers', description: 'Offer management endpoints' },
      { name: 'AI', description: 'AI chat and search endpoints' },
      { name: 'Ask AI', description: 'Ask AI assistant endpoints (role-scoped, read-only)' },
      { name: 'Chat', description: 'Chat threads and messages (tenant & landlord)' },
      { name: 'Mirror', description: 'Blockchain mirror and reconciliation endpoints' },
      { name: 'Organizations', description: 'Organization and membership management' },
      { name: 'TEPA', description: 'Tenant Equity Participation Agreement endpoints' },
      { name: 'Admin', description: 'Admin-only operational endpoints' },
      { name: 'Health', description: 'Public health and readiness endpoints' },
      { name: 'Onboarding', description: 'Onboarding status and progression endpoints' },
      { name: 'Documents', description: 'Document upload (signed URL + metadata)' },
      { name: 'Program', description: 'Program KPIs, fiscal impact, compliance, and TEPA analytics' },
      { name: 'Reports', description: 'Reports and exports (e.g. City Council Brief PDF)' },
      { name: 'Campaigns', description: 'Landlord rewards campaigns (event-triggered, BE-205)' },
      { name: 'ActivityLog', description: 'Property-scoped audit timeline (audit_events)' },
      { name: 'CSV', description: 'CSV import validation and summary (BE-308, BE-309)' },
      { name: 'CapTable', description: 'Property cap table and ownership from token ledger (BE-310)' },
    ],
  },
  apis: [
    './src/modules/**/routes/*.ts',
    './src/modules/**/*.routes.ts',
    './src/**/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
