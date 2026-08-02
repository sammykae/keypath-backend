import { env } from '../config/env';

export function maskValue(
  value: string,
  maskWith = '****'
): string {
  if (!env.DEMO_MODE) return value;
  return maskWith;
}

export function maskEmail(email: string): string {
  if (!env.DEMO_MODE) return email;
  const [name, domain] = email.split('@');
  return `${name[0]}***@${domain}`;
}
