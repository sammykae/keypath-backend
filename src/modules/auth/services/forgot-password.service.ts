import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/user.model';
import { AppError } from '../../../core/errors/AppError';
import { sendPasswordResetOtpEmail } from '../../../core/email/email-otp.service';

const OTP_EXPIRY_MS = 15 * 60 * 1000;

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).exec();
  if (!user) return;

  const otp = String(crypto.randomInt(100000, 999999));
  const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

  await User.findByIdAndUpdate(user._id, {
    $set: { emailOtp: otp, emailOtpExpiry: expiry }
  });

  await sendPasswordResetOtpEmail(
    normalizedEmail,
    otp,
    user.profile?.firstName ?? ''
  ).catch(() => undefined);
}

export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string
): Promise<void> {
  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).exec();
  if (!user) throw new AppError('Invalid or expired reset code', 400);

  if (
    !user.emailOtp ||
    !user.emailOtpExpiry ||
    user.emailOtp !== otp.trim() ||
    user.emailOtpExpiry < new Date()
  ) {
    throw new AppError('Invalid or expired reset code', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await User.findByIdAndUpdate(user._id, {
    $set: { passwordHash, emailOtp: null, emailOtpExpiry: null }
  });
}
