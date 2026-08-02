import sgMail from "@sendgrid/mail";
import { env } from "../config/env";

function getSendGridApiKey(): string | undefined {
  const k = process.env.EMAIL_password ?? process.env.SENDGRID_API_KEY;
  if (k && k.startsWith("SG.")) return k.trim();
  return undefined;
}

function getFromEmail(): string {
  return (
    process.env.EMAIL_user?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "noreply@keypath.ai"
  );
}

export function isEmailConfigured(): boolean {
  return Boolean(getSendGridApiKey());
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const apiKey = getSendGridApiKey();
  if (!apiKey) {
    throw new Error("EMAIL_password (SendGrid API key) not configured");
  }

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to: params.to,
    from: { email: getFromEmail(), name: "KeyPath" },
    subject: params.subject,
    text: params.text,
    html: params.html ?? `<pre style="font-family:sans-serif">${escapeHtml(params.text)}</pre>`,
  });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const emailSans =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export function buildKeypathTenantInviteEmailHtml(opts: {
  propertyName: string;
  unitNumber: string;
  leaseSummary: string;
  expiresDisplay: string;
  signInUrl: string;
  tenantEmail: string;
  /** When set, new account: show temp password. When omitted, existing account: email only + security note (password is never emailed). */
  temporaryPassword?: string;
}): string {
  const {
    propertyName,
    unitNumber,
    leaseSummary,
    expiresDisplay,
    signInUrl,
    tenantEmail,
    temporaryPassword,
  } = opts;

  const e = escapeHtml;
  const safeUrl = signInUrl.replace(/"/g, "%22");

  const credentialBlock = temporaryPassword
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border-radius:10px;background:#f0fdfa;border:1px solid #99f6e4;overflow:hidden;">
        <tr>
          <td style="padding:18px 20px;font-family:${emailSans};font-size:14px;color:#134e4a;line-height:1.6;">
            <div style="font-weight:600;margin-bottom:12px;color:#0f766e;">Your sign-in details</div>
            <div style="margin-bottom:6px;"><span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Email</span><br/>
            <span style="font-size:15px;color:#0f172a;word-break:break-all;">${e(tenantEmail)}</span></div>
            <div style="margin-top:12px;"><span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Temporary password</span><br/>
            <code style="display:inline-block;margin-top:4px;padding:10px 14px;background:#fff;border-radius:6px;border:1px solid #cbd5e1;font-size:14px;color:#0f172a;letter-spacing:0.02em;">${e(temporaryPassword)}</code></div>
            <p style="margin:14px 0 0;font-size:13px;color:#475569;">After you sign in, change your password if the app lets you.</p>
          </td>
        </tr>
      </table>`
    : `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="padding:18px 20px;font-family:${emailSans};font-size:14px;color:#334155;line-height:1.65;">
            <div style="font-weight:600;margin-bottom:10px;color:#0f172a;">Sign in with your existing KeyPath account</div>
            <div style="margin-bottom:10px;"><span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Your email</span><br/>
            <span style="font-size:15px;color:#0f172a;font-weight:600;word-break:break-all;">${e(tenantEmail)}</span></div>
            <p style="margin:0;font-size:13px;color:#64748b;">
              <strong style="color:#475569;">Password</strong> — For security we never send your password by email.
              Use the password you already use for KeyPath. If you forgot it, use <strong>Forgot password</strong> on the sign-in page.
            </p>
            <p style="margin:12px 0 0;font-size:13px;color:#334155;">After you sign in, this invitation will complete automatically.</p>
          </td>
        </tr>
      </table>`;

  const unitRow =
    unitNumber.trim().length > 0
      ? `<tr><td style="padding:8px 0;font-family:${emailSans};font-size:14px;color:#64748b;width:36%;">Unit</td><td style="padding:8px 0;font-family:${emailSans};font-size:14px;color:#0f172a;font-weight:500;">${e(unitNumber)}</td></tr>`
      : "";

  const leaseRow =
    leaseSummary.trim().length > 0
      ? `<tr><td style="padding:8px 0;font-family:${emailSans};font-size:14px;color:#64748b;vertical-align:top;">Lease</td><td style="padding:8px 0;font-family:${emailSans};font-size:14px;color:#0f172a;">${e(leaseSummary)}</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>KeyPath invitation</title></head>
<body style="margin:0;padding:0;background:#e8eef2;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#e8eef2;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
        <tr>
          <td style="background:linear-gradient(145deg,#115e59 0%,#0f766e 48%,#134e4a 100%);padding:28px 32px 26px;">
            <div style="font-family:${emailSans};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.75);">KeyPath</div>
            <div style="font-family:${emailSans};font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#ffffff;margin-top:8px;line-height:1.25;">You're invited</div>
            <div style="font-family:${emailSans};font-size:15px;color:rgba(255,255,255,0.88);margin-top:8px;line-height:1.5;">Your landlord has invited you to join a property on KeyPath.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;font-family:${emailSans};font-size:15px;line-height:1.65;color:#334155;">
            <p style="margin:0 0 18px;">Hello,</p>
            ${credentialBlock}
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:20px;">
              <tr><td style="padding:8px 0;font-family:${emailSans};font-size:14px;color:#64748b;width:36%;">Property</td><td style="padding:8px 0;font-family:${emailSans};font-size:14px;color:#0f172a;font-weight:600;">${e(propertyName)}</td></tr>
              ${unitRow}
              ${leaseRow}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 8px;">
              <tr>
                <td align="center">
                  <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff!important;text-decoration:none;font-family:${emailSans};font-size:15px;font-weight:600;border-radius:10px;box-shadow:0 2px 8px rgba(15,118,110,0.35);">Sign in to KeyPath</a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:13px;color:#64748b;text-align:center;font-family:${emailSans};">Or open the KeyPath app and sign in with the same email.</p>
            <p style="margin:24px 0 0;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-family:${emailSans};line-height:1.55;">
              <strong style="color:#475569;">Invitation expires</strong><br/>${e(expiresDisplay)}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:12px;color:#94a3b8;font-family:${emailSans};line-height:1.5;">This message was sent by KeyPath regarding your property invitation. If you did not expect this email, you can ignore it.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function getTenantInviteBaseUrl(): string {
  const front = process.env.FRONTEND_URL?.trim();
  if (front) return front.replace(/\/$/, "");
  return env.BACKEND_URL.replace(/\/$/, "");
}
