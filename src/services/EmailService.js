const nodemailer = require('nodemailer');
const crypto = require('crypto');
const PricingService = require('./PricingService');

class EmailService {
  static isEnabled() {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );
  }

  static getTransporter() {
    const port = parseInt(process.env.SMTP_PORT, 10);
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toString().toLowerCase() === 'true'
      : port === 465;

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  static getAcceptToken({ leadId, providerId, expiresAtMs }) {
    const secret = process.env.EMAIL_LINK_SECRET;
    if (!secret) {
      throw new Error('Missing EMAIL_LINK_SECRET');
    }

    const payload = {
      leadId: leadId.toString(),
      providerId: providerId.toString(),
      exp: expiresAtMs
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  static verifyAcceptToken(token) {
    const secret = process.env.EMAIL_LINK_SECRET;
    if (!secret) {
      throw new Error('Missing EMAIL_LINK_SECRET');
    }

    const [payloadB64, sig] = (token || '').split('.');
    if (!payloadB64 || !sig) return null;

    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    if (sig !== expectedSig) return null;

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    if (!payload?.leadId || !payload?.providerId || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;

    return payload;
  }

  static async sendMail({ to, subject, html, text }) {
    if (!this.isEnabled()) {
      console.log('EmailService disabled (missing SMTP env vars)');
      return { skipped: true };
    }

    const from = process.env.SMTP_FROM || 'hello@goldtouchlist.com';
    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text
    });

    console.log('Email sent successfully:', info.messageId);
    return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
  }

  static buildAcceptEmailHtml({ providerName, leadSummaryText, acceptUrl, priceText }) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unlock Lead</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; padding:24px;">
    <h2 style="margin:0 0 12px 0;">New Lead Available</h2>
    <p style="margin:0 0 16px 0; color:#333;">Hi${providerName ? ` ${providerName}` : ''},</p>
    <p style="margin:0 0 16px 0; color:#333;">You have a new client request available. Unlock full contact details for <strong>${priceText}</strong>.</p>
    <pre style="white-space:pre-wrap; background:#f3f4f6; border-radius:10px; padding:14px; color:#111;">${leadSummaryText}</pre>
    <div style="margin:18px 0 10px 0; text-align:center;">
      <a href="${acceptUrl}" style="display:inline-block; padding:14px 18px; background:#111827; color:#fff; border-radius:10px; text-decoration:none; font-weight:700;">Accept &amp; Unlock Full Details</a>
    </div>
    <p style="margin:10px 0 0 0; color:#6b7280; font-size:13px;">If the button doesn’t work, copy and paste this link into your browser:</p>
    <p style="margin:6px 0 0 0; font-size:13px; word-break:break-all;"><a href="${acceptUrl}">${acceptUrl}</a></p>
  </div>
</body>
</html>`;
  }

  static async sendAcceptUnlockEmail({ provider, leadData, leadId, priceCents }) {
    if (!provider?.email) return { skipped: true };

    const domain = process.env.DOMAIN;
    if (!domain) throw new Error('Missing DOMAIN');

    const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
    const token = this.getAcceptToken({ leadId, providerId: provider.id, expiresAtMs });
    const acceptUrl = `${domain}/unlocks/accept?token=${encodeURIComponent(token)}`;

    const priceText = PricingService.formatPriceFromCents(priceCents);
    const leadSummaryText = `Service: ${leadData.service_type}\nLocation: ${leadData.city}\nWhen: ${leadData.preferred_time_window || 'Flexible'}\nSession: ${leadData.session_length || leadData.length || 'Not specified'}`;

    const subject = `New Lead Available — Unlock for ${priceText}`;
    const html = this.buildAcceptEmailHtml({
      providerName: provider.name,
      leadSummaryText,
      acceptUrl,
      priceText
    });

    const text = `New Lead Available\n\nUnlock full contact details for ${priceText}.\n\n${leadSummaryText}\n\nAccept & Unlock: ${acceptUrl}`;

    return await this.sendMail({ to: provider.email, subject, html, text });
  }

  static buildUnlockedDetailsEmailHtml({ providerName, privateDetails, publicDetails }) {
    const whenText = publicDetails?.preferred_time_window || 'Flexible';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lead Unlocked</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; padding:24px;">
    <h2 style="margin:0 0 12px 0;">Lead Unlocked</h2>
    <p style="margin:0 0 16px 0; color:#333;">Hi${providerName ? ` ${providerName}` : ''},</p>
    <p style="margin:0 0 16px 0; color:#333;">Here are the full client details:</p>

    <div style="background:#f3f4f6; border-radius:10px; padding:14px;">
      <p style="margin:0 0 8px 0;"><strong>Client:</strong> ${privateDetails.client_name}</p>
      <p style="margin:0 0 8px 0;"><strong>Phone:</strong> ${privateDetails.client_phone}</p>
      <p style="margin:0 0 8px 0;"><strong>Email:</strong> ${privateDetails.client_email || 'Not provided'}</p>
      <p style="margin:0 0 8px 0;"><strong>Address:</strong> ${privateDetails.exact_address || privateDetails.city || ''}</p>
      <p style="margin:0 0 8px 0;"><strong>Service:</strong> ${publicDetails.service_type}</p>
      <p style="margin:0;"><strong>When:</strong> ${whenText}</p>
    </div>

    <p style="margin:16px 0 0 0; color:#6b7280; font-size:13px;">Gold Touch List provides advertising access to client inquiries. We do not arrange or guarantee appointments.</p>
  </div>
</body>
</html>`;
  }

  static async sendUnlockedDetailsEmail({ provider, privateDetails, publicDetails }) {
    if (!provider?.email) return { skipped: true };

    const subject = 'Lead Unlocked — Full Client Details';
    const html = this.buildUnlockedDetailsEmailHtml({
      providerName: provider.name,
      privateDetails,
      publicDetails
    });

    const text = `Lead Unlocked\n\nClient: ${privateDetails.client_name}\nPhone: ${privateDetails.client_phone}\nEmail: ${privateDetails.client_email || 'Not provided'}\nAddress: ${privateDetails.exact_address || privateDetails.city || ''}\nService: ${publicDetails.service_type}\nWhen: ${publicDetails.preferred_time_window || 'Flexible'}`;

    return await this.sendMail({ to: provider.email, subject, html, text });
  }
}

module.exports = EmailService;
