import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeoData {
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

async function getGeoLocation(ip: string): Promise<GeoData> {
  try {
    if (ip === "Unknown" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return { city: null, country: null, countryCode: null };
    }
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city`);
    const data = await response.json();
    
    if (data.status === "success") {
      return {
        city: data.city || null,
        country: data.country || null,
        countryCode: data.countryCode || null,
      };
    }
  } catch (error) {
    console.error("Geolocation lookup failed:", error);
  }
  return { city: null, country: null, countryCode: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const body = await req.json();
    const { email, type = "attempt" } = body;
    
    if (!email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get the client IP from various headers
    const clientIp = 
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "Unknown";

    const now = new Date().toISOString();
    
    // Get geolocation data
    const geo = await getGeoLocation(clientIp);
    const location = geo.city && geo.country 
      ? `${geo.city}, ${geo.country}` 
      : geo.country || null;

    console.log(`Capturing ${type} for ${email}: IP=${clientIp}, Location=${location}`);

    // Find user by email
    const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers();
    
    if (listError) {
      throw listError;
    }

    const user = users.find(u => u.email === email);
    
    if (!user) {
      // User not found, just log and return
      console.log(`User not found for email: ${email}`);
      return new Response(JSON.stringify({ success: true, message: "Logged" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Update user metadata
    const metadataUpdate: Record<string, any> = {
      ...user.user_metadata,
      last_attempt_ip: clientIp,
      last_attempt_at: now,
      last_attempt_location: location,
    };

    if (type === "login") {
      metadataUpdate.last_sign_in_ip = clientIp;
      metadataUpdate.last_sign_in_at_custom = now;
      metadataUpdate.last_sign_in_location = location;
    }

    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      user.id,
      { user_metadata: metadataUpdate }
    );

    if (updateError) {
      console.error("Error updating user metadata:", updateError);
      throw updateError;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      ip: clientIp, 
      location,
      type 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error capturing login attempt:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
