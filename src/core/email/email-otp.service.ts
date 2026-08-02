import crypto from 'crypto';
import { Types } from 'mongoose';
import { User } from '../../modules/auth/models/user.model';
import { AppError } from '../errors/AppError';
import { sendEmail, isEmailReady, escapeHtml } from './eb.sendgrid.service';

const OTP_EXPIRY_MS = 15 * 60 * 1000;

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function sendOnboardingOtpEmail(
  email: string,
  otp: string,
  firstName: string
): Promise<void> {
  const emailSans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:${emailSans};">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">Verify your email</h2>
      <p style="color:#64748b;margin:0 0 24px;">Hi ${escapeHtml(firstName || 'there')}, enter this code to verify your email address and continue onboarding.</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 32px;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#0f172a;">${escapeHtml(otp)}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;text-align:center;">This code expires in 15 minutes. If you didn't create a KeyPath account, you can ignore this email.</p>
    </div>
  </body></html>`;

  if (isEmailReady()) {
    await sendEmail({
      to: email,
      subject: 'Your KeyPath verification code',
      text: `Your KeyPath email verification code is: ${otp}\n\nThis code expires in 15 minutes.`,
      html,
    });
  }
}

export async function sendPasswordResetOtpEmail(
  email: string,
  otp: string,
  firstName: string
): Promise<void> {
  const emailSans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:${emailSans};">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">Reset your password</h2>
      <p style="color:#64748b;margin:0 0 24px;">Hi ${escapeHtml(firstName || 'there')}, enter this code to reset your KeyPath password.</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 32px;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#0f172a;">${escapeHtml(otp)}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;text-align:center;">This code expires in 15 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  </body></html>`;

  if (isEmailReady()) {
    await sendEmail({
      to: email,
      subject: 'Reset your KeyPath password',
      text: `Your KeyPath password reset code is: ${otp}\n\nThis code expires in 15 minutes.`,
      html,
    });
  }
}

export async function issueOtpForUser(userId: Types.ObjectId, email: string, firstName: string): Promise<void> {
  const otp = generateOtp();
  const expiry = new Date(Date.now() + OTP_EXPIRY_MS);
  await User.findByIdAndUpdate(userId, { $set: { emailOtp: otp, emailOtpExpiry: expiry } });
  await sendOnboardingOtpEmail(email, otp, firstName).catch(() => undefined);
}

export async function verifyUserOtp(userId: Types.ObjectId, otp: string): Promise<void> {
  const user = await User.findById(userId).exec();
  if (!user) throw new AppError('User not found', 404);
  if (user.emailVerified) return;

  if (
    !user.emailOtp ||
    !user.emailOtpExpiry ||
    user.emailOtp !== otp.trim() ||
    user.emailOtpExpiry < new Date()
  ) {
    throw new AppError('Invalid or expired verification code', 400);
  }

  await User.findByIdAndUpdate(userId, {
    $set: { emailVerified: true, emailOtp: null, emailOtpExpiry: null },
  });
}
