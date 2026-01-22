import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role to perform migration (this is a safe, idempotent operation)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get all agency applications with logos
    const { data: applications, error: appsError } = await supabase
      .from('agency_applications')
      .select('id, agency_name, logo_url')
      .not('logo_url', 'is', null)
      .eq('status', 'approved');
    
    if (appsError) throw appsError;
    
    const results: { agency: string; status: string; error?: string }[] = [];
    
    for (const app of applications || []) {
      try {
        // Download from private bucket
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('agency-documents')
          .download(app.logo_url);
        
        if (downloadError) {
          results.push({ agency: app.agency_name, status: 'failed', error: downloadError.message });
          continue;
        }
        
        // Upload to public bucket
        const { error: uploadError } = await supabase.storage
          .from('agency-logos')
          .upload(app.logo_url, fileData, { upsert: true });
        
        if (uploadError) {
          results.push({ agency: app.agency_name, status: 'failed', error: uploadError.message });
          continue;
        }
        
        results.push({ agency: app.agency_name, status: 'migrated' });
      } catch (err: any) {
        results.push({ agency: app.agency_name, status: 'error', error: err.message });
      }
    }
    
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
