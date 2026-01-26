/**
 * Email utility for sending transactional emails
 *
 * Uses nodemailer with AWS SES SMTP configuration.
 * Configure via environment variables:
 * - EMAIL_SERVER: SMTP connection string (e.g., smtp://user:pass@email-smtp.us-east-2.amazonaws.com:587)
 * - EMAIL_FROM: Sender email address
 */

import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (!process.env.EMAIL_SERVER) {
    return null
  }
  if (!transporter) {
    transporter = nodemailer.createTransport(process.env.EMAIL_SERVER)
  }
  return transporter
}

const EMAIL_FROM = process.env.EMAIL_FROM || "Nacho Builders <noreply@nacho.builders>"

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html: string
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<boolean> {
  const mailer = getTransporter()
  if (!mailer) {
    console.warn("EMAIL_SERVER not configured, skipping email send")
    return false
  }

  try {
    await mailer.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      text,
      html,
    })
    return true
  } catch (error) {
    console.error("Failed to send email:", error)
    return false
  }
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmationEmail(
  email: string,
  name: string | null,
  credits: number,
  adaAmount: number,
  txHash: string
): Promise<boolean> {
  const userName = name || "there"

  return sendEmail({
    to: email,
    subject: "Payment Confirmed - Credits Added",
    text: `Hi ${userName},

Your payment of ${adaAmount.toFixed(2)} ADA has been confirmed!

${credits.toLocaleString()} credits have been added to your account.

Transaction: https://cardanoscan.io/transaction/${txHash}

Thank you for using Nacho Builders API!

Best,
The Nacho Builders Team`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0f; color: #e5e5e5; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #141419; border-radius: 12px; padding: 32px; border: 1px solid #2a2a35;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px;">✅</div>
    </div>

    <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 16px; text-align: center;">
      Payment Confirmed!
    </h1>

    <p style="color: #a1a1aa; margin: 0 0 24px; text-align: center;">
      Hi ${userName}, your payment has been processed.
    </p>

    <div style="background-color: #1a1a22; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="color: #71717a;">Amount Paid</span>
        <span style="color: #ffffff; font-weight: 600;">${adaAmount.toFixed(2)} ADA</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #71717a;">Credits Added</span>
        <span style="color: #22c55e; font-weight: 600;">${credits.toLocaleString()}</span>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="https://cardanoscan.io/transaction/${txHash}"
         style="color: #3b82f6; font-size: 14px; text-decoration: none;">
        View Transaction on Cardanoscan →
      </a>
    </div>

    <div style="text-align: center;">
      <a href="https://app.nacho.builders/dashboard"
         style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
        Go to Dashboard
      </a>
    </div>

    <p style="color: #71717a; font-size: 12px; text-align: center; margin: 24px 0 0;">
      Nacho Builders API • Cardano Infrastructure
    </p>
  </div>
</body>
</html>`,
  })
}

/**
 * Send low credits warning email
 */
export async function sendLowCreditsEmail(
  email: string,
  name: string | null,
  remainingCredits: number
): Promise<boolean> {
  const userName = name || "there"

  return sendEmail({
    to: email,
    subject: "Low Credits Alert",
    text: `Hi ${userName},

Your API credit balance is running low.

Remaining credits: ${remainingCredits.toLocaleString()}

Purchase more credits to ensure uninterrupted API access:
https://app.nacho.builders/billing

Best,
The Nacho Builders Team`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0f; color: #e5e5e5; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #141419; border-radius: 12px; padding: 32px; border: 1px solid #2a2a35;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px;">⚠️</div>
    </div>

    <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 16px; text-align: center;">
      Low Credits Alert
    </h1>

    <p style="color: #a1a1aa; margin: 0 0 24px; text-align: center;">
      Hi ${userName}, your credit balance is running low.
    </p>

    <div style="background-color: #1a1a22; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <span style="color: #71717a; display: block; margin-bottom: 8px;">Remaining Credits</span>
      <span style="color: #f59e0b; font-size: 32px; font-weight: 700;">${remainingCredits.toLocaleString()}</span>
    </div>

    <div style="text-align: center;">
      <a href="https://app.nacho.builders/billing"
         style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
        Buy More Credits
      </a>
    </div>

    <p style="color: #71717a; font-size: 12px; text-align: center; margin: 24px 0 0;">
      Nacho Builders API • Cardano Infrastructure
    </p>
  </div>
</body>
</html>`,
  })
}

// Admin notification email address
const ADMIN_EMAIL = "michael@nacho.builders"

/**
 * Send admin notification for new user signup
 */
export async function sendAdminNewUserEmail(
  userEmail: string,
  userName: string | null
): Promise<boolean> {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `[NACHO] New user signup: ${userEmail}`,
    text: `New user signed up:\n\nEmail: ${userEmail}\nName: ${userName || 'Not provided'}\nTime: ${new Date().toISOString()}`,
    html: `<p><strong>New user signed up:</strong></p><ul><li>Email: ${userEmail}</li><li>Name: ${userName || 'Not provided'}</li><li>Time: ${new Date().toISOString()}</li></ul>`,
  })
}

/**
 * Send admin notification for pending payment
 */
export async function sendAdminPaymentPendingEmail(
  userEmail: string,
  adaAmount: number,
  credits: number,
  paymentAddress: string
): Promise<boolean> {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `[NACHO] Payment pending: ${adaAmount} ADA from ${userEmail}`,
    text: `New payment initiated:\n\nUser: ${userEmail}\nAmount: ${adaAmount} ADA\nCredits: ${credits.toLocaleString()}\nAddress: ${paymentAddress}\nTime: ${new Date().toISOString()}`,
    html: `<p><strong>New payment initiated:</strong></p><ul><li>User: ${userEmail}</li><li>Amount: ${adaAmount} ADA</li><li>Credits: ${credits.toLocaleString()}</li><li>Address: <code>${paymentAddress}</code></li><li>Time: ${new Date().toISOString()}</li></ul>`,
  })
}

/**
 * Send admin notification for confirmed payment
 */
export async function sendAdminPaymentConfirmedEmail(
  userEmail: string,
  adaAmount: number,
  credits: number,
  txHash: string
): Promise<boolean> {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `[NACHO] Payment confirmed: ${adaAmount} ADA from ${userEmail}`,
    text: `Payment confirmed:\n\nUser: ${userEmail}\nAmount: ${adaAmount} ADA\nCredits: ${credits.toLocaleString()}\nTx: https://cardanoscan.io/transaction/${txHash}\nTime: ${new Date().toISOString()}`,
    html: `<p><strong>Payment confirmed:</strong></p><ul><li>User: ${userEmail}</li><li>Amount: ${adaAmount} ADA</li><li>Credits: ${credits.toLocaleString()}</li><li>Tx: <a href="https://cardanoscan.io/transaction/${txHash}">${txHash.slice(0,16)}...</a></li><li>Time: ${new Date().toISOString()}</li></ul>`,
  })
}
