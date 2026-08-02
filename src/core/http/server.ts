import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger';
import errorMiddleware from '../../middleware/error.middleware';
import { keypathErrorMiddleware } from '../../middleware/keypathError.middleware';
import aiRouter from '../../modules/ai/routes/ai.routes'
import tokensRouter from '../../modules/tokens/routes/tokens';
import marketplaceRouter from '../../modules/marketplace/routes/portfolios';
import offerRoutes from '../../modules/offer/routes/offers';
import passport from 'passport';
import unitRoutes from '../../modules/units/routes/unit.routes';
import tenantRoutes from '../../modules/tenant/routes/tenants.routes'
import invitesRouter from '../../modules/invites/routes/invites.routes';
import tepaRoutes from '../../modules/tepa/routes/tepa.routes';
import { demoGuard } from '../../middleware/demoGuard.middleware';
import orgRoutes from "../../modules/orgs/routes/org.routes";
import askAiRoutes from '../../modules/ask-ai/routes/askAi.routes';
import publicRoutes from '../../modules/public/routes/public.routes';
import authRoutes from '../../modules/auth/routes/auth.routes';
import landlordUnitsRoutes from '../../modules/units/routes/landlordUnits.routes';
import landlordDashboardRoutes from '../../modules/landlord/routes/landlordDashboard.routes';
import notesRoutes from '../../modules/notes/routes/notes.routes';
import goodStandingRoutes from '../../modules/good-standing/routes/goodStanding.routes';
import programConfigRoutes from '../../modules/program-config/routes/programConfig.routes';
import { propertyManagerLandlordRoutes, propertyManagerSelfRoutes } from '../../modules/property-manager/routes/propertyManager.routes';
import propertyManagerInviteRoutes from '../../modules/property-manager/routes/propertyManagerInvite.routes';
import independentPropertyManagerRoutes from '../../modules/property-manager/routes/independentPropertyManager.routes';
import { liquidityTenantRoutes, liquidityLandlordRoutes } from '../../modules/liquidity/routes/liquidity.routes';
import landlordChatRoutes from '../../modules/chat/routes/landlordChat.routes';
import tenancyRoutes from '../../modules/tenancies/routes/tenancyRoutes';
import ledgerRoutes from '../../modules/ledger/routes/ledgerRoutes';
import demoRoutes from '../../modules/demo/routes/demo.routes';
import onboardingRoutes from '../../modules/onboarding/routes/onboarding.routes';
import participationResolutionRoutes from '../../modules/participation/routes/participationResolution.routes';
import notificationRoutes from '../../modules/notifications/routes/notification.routes';

import landlordCreditsRoutes from '../../modules/ledger/routes/landlordCredits.routes';
import landlordPaymentsRoutes from '../../modules/payments/routes/landlordPayments.routes';
import stripeWebhookRoutes from '../../modules/payments/routes/stripeWebhook.routes';
import stripePaymentsRoutes from '../../modules/payments/routes/stripePayments.routes';
import chatRoutes from '../../modules/chat/routes/chat.routes';
import tenantChatRoutes from '../../modules/chat/routes/tenantChat.routes';
import communityChatRoutes from '../../modules/chat/routes/communityChat.routes';
import communityDashboardRoutes from '../../modules/community/routes/communityDashboard.routes';
import dashboardRoutes from '../../modules/dashboard/routes/dashboardRoutes';
import propertyRoutes from '../../modules/properties/routes/properties';
import programRoutes from '../../modules/program/routes/program.routes';
import docsRoutes from '../../modules/docs/routes/docs.routes';
import csvIngestionRoutes from '../../modules/csv-ingestion/routes/csv-ingestion.routes';
import landlordTenantParticipationRoutes from '../../modules/tenant-participation/routes/landlordTenantParticipation.routes';
import tenantTenantParticipationRoutes from '../../modules/tenant-participation/routes/tenantTenantParticipation.routes';
import auditActivityLogRoutes from '../../modules/audit/routes/auditActivityLog.routes';
import reportsRoutes from '../../modules/reports/routes/reports.routes';
import { dataExportHandler } from '../../modules/reports/controllers/dataExport.controller';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { normalizeRoleForRbac } from '../../modules/tenant/middleware/normalizeRoleForRbac';
import rewardsCampaignsRoutes from '../../modules/rewardsCampaigns/routes/rewardsCampaigns.routes';
import csvImportRoutes from '../../modules/csv-import/routes/csvImport.routes';
import capTableRoutes from '../../modules/cap-table/routes/capTable.routes';
import searchRoutes from '../../modules/search/routes/search.routes';
import searchLogRoutes from '../../modules/search-log/routes/search-log.routes';
import searchIndexRoutes from '../../modules/search-index/routes/search-index.routes';
import path from 'path'
import fs from 'fs'

export const createServer = () => {
  const app = express();

  app.use(express.static('public', {
    extensions: ["html"]
  }));

  app.use(helmet());
  /**
   * This needs to be removed. We don't need CORS
   * TODO: For the local setup, add a proxy on the react app
   */
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    })
  );
  app.use(
    compression({
      filter: (req, res) => {
        const accept = req.headers.accept || '';
        if (accept.includes('text/event-stream')) {
          return false;
        }

        return compression.filter(req, res);
      },
    }),
  );
  app.use(passport.initialize());

  /**
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use(limiter);
  */

  // Stripe webhook requires raw body for signature verification.
  app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());

// Swagger documentation
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(swaggerSpec);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'KeyPath API Documentation',
}));
app.use(demoGuard);
  app.use('/api/ai', aiRouter);
  app.use('/api/ask-ai', askAiRoutes);
  app.use('/api/tokens', tokensRouter);
  app.use('/api/marketplace', marketplaceRouter);
  app.use('/api/offers', offerRoutes);

app.use('/api', demoRoutes);

 
app.use('/api', onboardingRoutes);


  app.use('/api/units', unitRoutes);
  app.use('/api/tenants/', tenantRoutes);
  app.use('/api/invites', invitesRouter);
  // app.use('/api/admin/mirror', mirrorRoutes)
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/tenant', tenantTenantParticipationRoutes);
  app.use('/api/tenants/chat', tenantChatRoutes);
  app.use("/api", orgRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', tepaRoutes);
  app.use('/api/auth', authRoutes);
  // Register before generic /api/landlord so PUT /tenant-participation is not piped through
  // other landlord routers (avoids duplicate middleware / edge cases in some clients).
  app.use('/api/landlord/tenant-participation', landlordTenantParticipationRoutes);
  app.use('/api/landlord', landlordUnitsRoutes);
  app.use('/api/landlord/notes', notesRoutes);
  app.use('/api/landlord/good-standing', goodStandingRoutes);
  app.use('/api/landlord/program-config', programConfigRoutes);
  app.use('/api/landlord/property-managers', propertyManagerLandlordRoutes);
  // Must be mounted before /api/property-manager below — that router applies
  // requireRole(['property_manager']) to every path under its prefix, which
  // would incorrectly block the public /independent/register endpoint.
  app.use('/api/property-manager/independent', independentPropertyManagerRoutes);
  app.use('/api/property-manager', propertyManagerSelfRoutes);
  app.use('/api/pm-invites', propertyManagerInviteRoutes);
  app.use('/api/tenants/liquidity', liquidityTenantRoutes);
  app.use('/api/landlord/liquidity', liquidityLandlordRoutes);
  app.use('/api/landlord/chat', landlordChatRoutes);
  app.use('/api/landlord', landlordDashboardRoutes);
  app.use('/api/landlord', rewardsCampaignsRoutes);
  app.use('/api/landlord/tenancies', tenancyRoutes);
  app.use('/api/ledger', ledgerRoutes);
  app.use('/api/landlord/credits', landlordCreditsRoutes);
  app.use('/api/landlord', landlordPaymentsRoutes);
  app.use('/api/payments/stripe', stripeWebhookRoutes);
  app.use('/api/stripe', stripePaymentsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportsRoutes);
  app.get('/api/exports/:dataset', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), dataExportHandler);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/program', programRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/community/dashboard', communityDashboardRoutes);
  app.use('/api', communityChatRoutes);
  app.use('/api/docs', docsRoutes);
  app.use('/api/csv', csvIngestionRoutes);
  app.use('/api', participationResolutionRoutes);
  app.use('/api/activity-logs', auditActivityLogRoutes);
  app.use('/api/csv', csvImportRoutes);
  app.use('/api/cap-table', capTableRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/search', searchLogRoutes);
  app.use('/api/admin/search-index', searchIndexRoutes);
  app.use('/api/notifications', notificationRoutes);

  app.use(keypathErrorMiddleware);
  app.use(errorMiddleware);

  return app;
};
