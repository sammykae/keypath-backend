import ExcelJS from 'exceljs';
import { logger } from '../../../core/logger';
import { sendEmail, isEmailReady, escapeHtml } from '../../../core/email/eb.sendgrid.service';
import type { IDemoRequest } from '../models/demo-request.model';

async function buildExcelAttachment(request: IDemoRequest): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KeyPath';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Demo Request');

  sheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 50 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 20;

  const rows = [
    ['First Name', request.firstName],
    ['Last Name', request.lastName],
    ['Email', request.email],
    ['Phone', request.phoneNumber],
    ['Title / Role', request.titleOrRole],
    ['Company / Organization', request.companyOrOrganization],
    ['Interested As', request.interestedAs],
    ['Inquiry Notes', request.inquiryNotes || '-'],
    ['Submitted At', request.createdAt?.toISOString() ?? new Date().toISOString()],
    ['Request ID', String(request._id)],
  ];

  rows.forEach((row, i) => {
    const dataRow = sheet.addRow({ field: row[0], value: row[1] });
    dataRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' },
    };
    dataRow.alignment = { vertical: 'middle', wrapText: true };
  });

  sheet.getColumn('field').font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

function buildEmailPayload(request: IDemoRequest) {
  const createdAtIso = request.createdAt?.toISOString() ?? new Date().toISOString();
  const requestId = String(request._id);

  const subject = `New demo request: ${request.firstName} ${request.lastName}`;

  const text = [
    'A new demo request was submitted.',
    '',
    `Name: ${request.firstName} ${request.lastName}`,
    `Email: ${request.email}`,
    `Phone: ${request.phoneNumber}`,
    `Title / Role: ${request.titleOrRole}`,
    `Company / Organization: ${request.companyOrOrganization}`,
    `Interested As: ${request.interestedAs}`,
    `Inquiry Notes: ${request.inquiryNotes || '-'}`,
    `Submitted At: ${createdAtIso}`,
    `Request ID: ${requestId}`,
  ].join('\n');

  const e = escapeHtml;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">New Demo Request</h2>
      <p style="color:#64748b;margin:0 0 24px;">Someone has submitted a demo request on KeyPath. Full details are attached as an Excel file.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#64748b;width:40%;">Name</td><td style="padding:8px 0;color:#0f172a;font-weight:500;">${e(request.firstName)} ${e(request.lastName)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;color:#0f172a;">${e(request.email)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Phone</td><td style="padding:8px 0;color:#0f172a;">${e(request.phoneNumber)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Title / Role</td><td style="padding:8px 0;color:#0f172a;">${e(request.titleOrRole)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Company</td><td style="padding:8px 0;color:#0f172a;">${e(request.companyOrOrganization)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Interested As</td><td style="padding:8px 0;color:#0f172a;">${e(request.interestedAs)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Notes</td><td style="padding:8px 0;color:#0f172a;">${e(request.inquiryNotes || '-')}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Submitted At</td><td style="padding:8px 0;color:#0f172a;">${e(createdAtIso)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Request ID</td><td style="padding:8px 0;color:#94a3b8;font-size:12px;">${e(requestId)}</td></tr>
      </table>
    </div>
  </body></html>`;

  return { subject, text, html };
}

export async function sendDemoRequestNotification(
  request: IDemoRequest
): Promise<{ messageId: string }> {
  if (!isEmailReady()) {
    logger.warn('SendGrid not configured — demo request notification not sent');
    return { messageId: 'not-sent' };
  }

  const recipients = [
    'partnerships@keypath.ai',
    'laurel.djoukeng@gmail.com',
  ];

  const payload = buildEmailPayload(request);
  const excelBase64 = await buildExcelAttachment(request);
  const filename = `demo-request-${request.firstName.toLowerCase()}-${request.lastName.toLowerCase()}-${Date.now()}.xlsx`;

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: [
          {
            content: excelBase64,
            filename,
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            disposition: 'attachment',
          },
        ],
      })
    )
  );

  logger.info(
    { demoRequestId: String(request._id), to: recipients },
    'Demo request notification sent via SendGrid with Excel attachment'
  );

  return { messageId: 'sent' };
}
