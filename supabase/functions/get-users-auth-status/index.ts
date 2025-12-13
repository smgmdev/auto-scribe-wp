import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get the authorization header to verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the caller is authenticated
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if caller is admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden - Admin only" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch all users with their details
    const { data: { users }, error: usersError } = await supabaseClient.auth.admin.listUsers();

    if (usersError) {
      throw usersError;
    }

    // Return user details including login info
    // Only use custom metadata fields for login tracking (not Supabase's built-in last_sign_in_at)
    // because the built-in field gets set on auto-login after signup
    const usersAuthStatus = users.map((user) => ({
      id: user.id,
      email_confirmed_at: user.email_confirmed_at,
      created_at: user.created_at,
      last_sign_in_at: user.user_metadata?.last_sign_in_at_custom || null,
      last_sign_in_ip: user.user_metadata?.last_sign_in_ip || null,
      last_sign_in_location: user.user_metadata?.last_sign_in_location || null,
      last_attempt_at: user.user_metadata?.last_attempt_at || null,
      last_attempt_ip: user.user_metadata?.last_attempt_ip || null,
      last_attempt_location: user.user_metadata?.last_attempt_location || null,
    }));

    return new Response(JSON.stringify({ users: usersAuthStatus }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error fetching users auth status:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});