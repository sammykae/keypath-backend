import { AppError } from '../../../core/errors/AppError';
import { logger } from '../../../core/logger';
import { sendEmail, isEmailReady, escapeHtml } from '../../../core/email/eb.sendgrid.service';

interface SendLandlordInviteEmailInput {
  toEmail: string;
  firstName: string;
  onboardingUrl: string;
  expiresAtIso: string;
}

export async function sendLandlordOnboardingInviteEmail(
  input: SendLandlordInviteEmailInput
): Promise<{ messageId: string }> {
  if (!input.toEmail?.trim()) {
    throw new AppError('Invite recipient email is missing', 400);
  }

  const expiresAt = new Date(input.expiresAtIso);
  const expiresLabel = Number.isNaN(expiresAt.getTime())
    ? input.expiresAtIso
    : expiresAt.toUTCString();

  const subject = 'Your KeyPath landlord onboarding link';

  const text = [
    `Hi ${input.firstName},`,
    '',
    'You have been invited to complete your landlord onboarding on KeyPath.',
    `Open this link to continue: ${input.onboardingUrl}`,
    '',
    `This link expires on: ${expiresLabel}`,
    '',
    'If you did not request this invite, you can ignore this email.',
  ].join('\n');

  const e = escapeHtml;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">Landlord onboarding invitation</h2>
      <p style="color:#64748b;margin:0 0 24px;">Hi ${e(input.firstName)}, you have been invited to complete your landlord onboarding on KeyPath.</p>
      <a href="${e(input.onboardingUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">Complete onboarding</a>
      <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;">This link expires on: <strong>${e(expiresLabel)}</strong><br/>If you did not request this invite, you can ignore this email.</p>
    </div>
  </body></html>`;

  if (!isEmailReady()) {
    logger.warn({ toEmail: input.toEmail }, 'SendGrid not configured — landlord invite not sent');
    return { messageId: 'not-sent' };
  }

  await sendEmail({ to: input.toEmail.trim().toLowerCase(), subject, text, html });

  logger.info({ toEmail: input.toEmail }, 'Landlord onboarding invite email sent via SendGrid');

  return { messageId: 'sent' };
}
