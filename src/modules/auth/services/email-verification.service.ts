import crypto from 'crypto';
import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { AppError } from '../../../core/errors/AppError';
import { isEmailReady, sendEmail, escapeHtml } from '../../../core/email/eb.sendgrid.service';

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL?.trim() || 'https://keypath.ai';
}

export async function sendVerificationEmail(userId: Types.ObjectId, email: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + TOKEN_EXPIRY_MS);

  await User.findByIdAndUpdate(userId, {
    $set: { emailVerificationToken: token, emailVerificationExpiry: expiry },
  });

  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${token}`;

  if (isEmailReady()) {
    await sendEmail({
      to: email,
      subject: 'Verify your KeyPath email address',
      text: `Please verify your email address by clicking the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\n— KeyPath`,
      html: buildVerificationEmailHtml(verifyUrl),
    });
  } else {
    console.log(`[auth] Email verification link for ${email}: ${verifyUrl}`);
  }
}

export async function verifyEmailToken(token: string): Promise<{ userId: string; email: string }> {
  if (!token) throw new AppError('Missing token', 400);

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpiry: { $gt: new Date() },
  });

  if (!user) throw new AppError('Invalid or expired verification link', 400);

  await User.findByIdAndUpdate(user._id, {
    $set: { emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null },
  });

  return { userId: user._id.toString(), email: user.email };
}

export async function resendVerificationEmail(userId: Types.ObjectId): Promise<void> {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404);
  if (user.emailVerified) throw new AppError('Email is already verified', 409);
  await sendVerificationEmail(userId, user.email);
}

function buildVerificationEmailHtml(verifyUrl: string): string {
  const emailSans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  return `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:${emailSans};">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">Verify your email</h2>
      <p style="color:#64748b;margin:0 0 24px;">Click the button below to verify your email address and activate your KeyPath account.</p>
      <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">Verify email address</a>
      <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">This link expires in 24 hours. If you didn't create a KeyPath account, you can ignore this email.</p>
    </div>
  </body></html>`;
}
