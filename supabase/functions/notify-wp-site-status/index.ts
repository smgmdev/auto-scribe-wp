import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyWPSiteStatusRequest {
  submissionId: string;
  status: 'approved' | 'rejected';
  adminNotes?: string;
  siteName: string;
  siteUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { submissionId, status, adminNotes, siteName, siteUrl }: NotifyWPSiteStatusRequest = await req.json();

    console.log(`Processing WP site status notification for submission ${submissionId}, status: ${status}`);

    // Get the submission to find the user's email
    const { data: submission, error: submissionError } = await supabase
      .from('wordpress_site_submissions')
      .select('user_id')
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      console.error('Error fetching submission:', submissionError);
      throw new Error('Submission not found');
    }

    // Get the user's email from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', submission.user_id)
      .single();

    if (profileError || !profile?.email) {
      console.error('Error fetching profile:', profileError);
      throw new Error('User email not found');
    }

    const agencyEmail = profile.email;
    console.log(`Sending notification to agency email: ${agencyEmail}`);

    const isApproved = status === 'approved';
    const subject = isApproved 
      ? `WordPress Site Approved: ${siteName}`
      : `WordPress Site Rejected: ${siteName}`;

    const statusColor = isApproved ? '#22c55e' : '#ef4444';
    const statusText = isApproved ? 'Approved' : 'Rejected';
    const statusMessage = isApproved
      ? 'Your WordPress site has been approved and is now visible in the Instant Publishing library. Users can now publish articles to your site.'
      : 'Unfortunately, your WordPress site submission has been rejected. Please review the feedback below and resubmit if applicable.';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background-color: ${statusColor}; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">WordPress Site ${statusText}</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 20px;">${siteName}</h2>
              <p style="color: #71717a; margin: 0 0 8px 0; font-size: 14px;">${siteUrl}</p>
              <p style="color: #3f3f46; margin: 24px 0; font-size: 16px; line-height: 1.6;">
                ${statusMessage}
              </p>
              ${adminNotes ? `
                <div style="background-color: #f4f4f5; border-radius: 6px; padding: 16px; margin: 24px 0;">
                  <p style="color: #52525b; margin: 0 0 8px 0; font-size: 12px; font-weight: 600; text-transform: uppercase;">Admin Notes</p>
                  <p style="color: #3f3f46; margin: 0; font-size: 14px; line-height: 1.5;">${adminNotes}</p>
                </div>
              ` : ''}
              <div style="text-align: center; margin-top: 32px;">
                <a href="https://arcanamace.com/agency" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                  View Your Sites
                </a>
              </div>
            </div>
            <div style="background-color: #f4f4f5; padding: 16px; text-align: center;">
              <p style="color: #71717a; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Arcana Mace <noreply@arcanamace.com>",
        to: [agencyEmail],
        subject: subject,
        html: html,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResponse = await res.json();
    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-wp-site-status function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
