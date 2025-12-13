import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log('Email hook received:', JSON.stringify(payload, null, 2));

    const { user, email_data } = payload;
    
    if (!user?.email) {
      console.log('No user email in payload');
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const email = user.email;
    const { token, token_hash, redirect_to, email_action_type } = email_data || {};

    console.log(`Processing ${email_action_type} email for: ${email}`);

    // Build verification URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    let verificationUrl = '';
    
    if (token_hash && email_action_type) {
      const redirectUrl = redirect_to || `${supabaseUrl.replace('.supabase.co', '.lovableproject.com')}/dashboard`;
      verificationUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirectUrl)}`;
    }

    let subject = '';
    let htmlContent = '';

    // Handle different email types
    switch (email_action_type) {
      case 'signup':
      case 'email_confirmation':
        subject = 'Welcome to Arcana Mace - Verify Your Email';
        htmlContent = buildWelcomeEmail(email, verificationUrl, token);
        break;
      case 'recovery':
      case 'magiclink':
        subject = 'Arcana Mace - Password Reset';
        htmlContent = buildPasswordResetEmail(email, verificationUrl, token);
        break;
      case 'invite':
        subject = 'You\'ve been invited to Arcana Mace';
        htmlContent = buildInviteEmail(email, verificationUrl, token);
        break;
      case 'email_change':
        subject = 'Arcana Mace - Confirm Email Change';
        htmlContent = buildEmailChangeEmail(email, verificationUrl, token);
        break;
      default:
        console.log(`Unknown email type: ${email_action_type}, sending generic email`);
        subject = 'Arcana Mace - Verify Your Email';
        htmlContent = buildWelcomeEmail(email, verificationUrl, token);
    }

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Error in email hook:", error);
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: error.message,
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

function buildWelcomeEmail(email: string, verificationUrl: string, token?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #000000;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="background-color: #1c1c1c; border-radius: 12px; max-width: 600px;">
              <tr>
                <td style="padding: 40px;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                    Welcome to Arcana Mace
                  </h1>
                  
                  <p style="color: #888888; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                    Thank you for creating an account. Please verify your email address to get started.
                  </p>
                  
                  ${verificationUrl ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${verificationUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                          Verify Your Email
                        </a>
                      </td>
                    </tr>
                  </table>
                  ${token ? `
                  <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 20px 0 0 0; text-align: center;">
                    Or use this verification code: <strong style="color: #ffffff;">${token}</strong>
                  </p>
                  ` : ''}
                  ` : ''}
                  
                  <div style="border-top: 1px solid #333333; margin: 30px 0; padding-top: 30px;">
                    <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 15px 0;">
                      What you can do with Arcana Mace:
                    </h3>
                    <ul style="color: #888888; font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
                      <li>Access our global media network</li>
                      <li>Publish articles instantly to WordPress sites</li>
                      <li>Connect with B2B media buying opportunities</li>
                      <li>Manage your content with powerful AI tools</li>
                    </ul>
                  </div>
                  
                  <p style="color: #666666; font-size: 12px; line-height: 20px; margin: 30px 0 0 0; text-align: center;">
                    If you didn't create this account, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #444444; font-size: 12px; margin: 20px 0 0 0; text-align: center;">
              © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function buildPasswordResetEmail(email: string, verificationUrl: string, token?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #000000;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="background-color: #1c1c1c; border-radius: 12px; max-width: 600px;">
              <tr>
                <td style="padding: 40px;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                    Reset Your Password
                  </h1>
                  
                  <p style="color: #888888; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                    We received a request to reset your password. Click the button below to proceed.
                  </p>
                  
                  ${verificationUrl ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${verificationUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                  
                  <p style="color: #666666; font-size: 12px; line-height: 20px; margin: 30px 0 0 0; text-align: center;">
                    If you didn't request a password reset, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #444444; font-size: 12px; margin: 20px 0 0 0; text-align: center;">
              © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function buildInviteEmail(email: string, verificationUrl: string, token?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #000000;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="background-color: #1c1c1c; border-radius: 12px; max-width: 600px;">
              <tr>
                <td style="padding: 40px;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                    You're Invited to Arcana Mace
                  </h1>
                  
                  <p style="color: #888888; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                    You've been invited to join Arcana Mace. Click the button below to accept the invitation.
                  </p>
                  
                  ${verificationUrl ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${verificationUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                          Accept Invitation
                        </a>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                </td>
              </tr>
            </table>
            
            <p style="color: #444444; font-size: 12px; margin: 20px 0 0 0; text-align: center;">
              © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function buildEmailChangeEmail(email: string, verificationUrl: string, token?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #000000;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="background-color: #1c1c1c; border-radius: 12px; max-width: 600px;">
              <tr>
                <td style="padding: 40px;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                    Confirm Email Change
                  </h1>
                  
                  <p style="color: #888888; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                    Please confirm your new email address by clicking the button below.
                  </p>
                  
                  ${verificationUrl ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${verificationUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                          Confirm Email
                        </a>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                  
                  <p style="color: #666666; font-size: 12px; line-height: 20px; margin: 30px 0 0 0; text-align: center;">
                    If you didn't request this change, please contact support immediately.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #444444; font-size: 12px; margin: 20px 0 0 0; text-align: center;">
              © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}