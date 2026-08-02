import sgMail from '@sendgrid/mail'

function getApiKey(): string | undefined {
  const key = process.env.EMAIL_password?.trim()
  if (key && key.startsWith('SG.')) return key
  return undefined
}

function getFromEmail(): string {
  return process.env.EMAIL_user?.trim() || 'noreply@keypath.ai'
}

export function isEmailReady(): boolean {
  return Boolean(getApiKey())
}

export async function sendEmail(params: {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: Array<{
    content: string
    filename: string
    type: string
    disposition: 'attachment' | 'inline'
  }>
}): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is not configured or is invalid')
  }

  sgMail.setApiKey(apiKey)

  await sgMail.send({
    to: params.to,
    from: { email: getFromEmail(), name: 'KeyPath' },
    subject: params.subject,
    text: params.text,
    html: params.html ?? params.text,
    attachments: params.attachments,
  })
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
