import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[import-marketing-emails] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function invoked");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Verify caller
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sheet_url, category } = await req.json();

    if (!sheet_url || typeof sheet_url !== "string") {
      return new Response(JSON.stringify({ error: "sheet_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validCategories = ["marketing_people", "agencies"];
    const selectedCategory = validCategories.includes(category) ? category : "marketing_people";

    // Convert Google Sheets URL to CSV export URL
    // Support formats:
    // https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
    // https://docs.google.com/spreadsheets/d/SHEET_ID/pub...
    const sheetIdMatch = sheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!sheetIdMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid Google Sheets URL. Must be a Google Sheets link." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sheetId = sheetIdMatch[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    logStep("Fetching CSV", { csvUrl });

    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch Google Sheet. Make sure the sheet is publicly accessible (Anyone with the link can view)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const csvText = await csvResponse.text();
    logStep("CSV fetched", { length: csvText.length });

    // Extract emails from CSV
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const allMatches = csvText.match(emailRegex) || [];
    
    // Deduplicate and lowercase
    const uniqueEmails = [...new Set(allMatches.map(e => e.toLowerCase()))];

    if (uniqueEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid email addresses found in the sheet." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Emails extracted", { count: uniqueEmails.length });

    // Batch upsert into marketing_emails
    let added = 0;
    let skipped = 0;
    const batchSize = 100;

    for (let i = 0; i < uniqueEmails.length; i += batchSize) {
      const batch = uniqueEmails.slice(i, i + batchSize).map(email => ({
        email,
        source_sheet_url: sheet_url,
      }));

      const { data, error } = await supabaseAdmin
        .from("marketing_emails")
        .upsert(batch, { onConflict: "email", ignoreDuplicates: true })
        .select("id");

      if (error) {
        logStep("Batch insert error", { error: error.message, batch: i });
      } else {
        added += (data || []).length;
      }
    }

    skipped = uniqueEmails.length - added;

    logStep("Import complete", { added, skipped, total: uniqueEmails.length });

    return new Response(
      JSON.stringify({
        success: true,
        total_found: uniqueEmails.length,
        added,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: "Failed to import emails" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
