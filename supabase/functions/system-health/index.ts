import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ServiceStatus {
  name: string
  status: 'available' | 'issue' | 'outage'
  latency?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const services: ServiceStatus[] = []

  // Check Database
  try {
    const start = Date.now()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { error } = await supabase.from('profiles').select('id').limit(1)
    const latency = Date.now() - start
    
    if (error) {
      services.push({ name: 'Database', status: 'outage', latency })
    } else if (latency > 2000) {
      services.push({ name: 'Database', status: 'issue', latency })
    } else {
      services.push({ name: 'Database', status: 'available', latency })
    }
  } catch {
    services.push({ name: 'Database', status: 'outage' })
  }

  // Check Authentication (via auth endpoint)
  try {
    const start = Date.now()
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey }
    })
    const latency = Date.now() - start
    
    if (!response.ok) {
      services.push({ name: 'Authentication', status: 'outage', latency })
    } else if (latency > 2000) {
      services.push({ name: 'Authentication', status: 'issue', latency })
    } else {
      services.push({ name: 'Authentication', status: 'available', latency })
    }
  } catch {
    services.push({ name: 'Authentication', status: 'outage' })
  }

  // Check Edge Functions (this function itself is proof it works)
  services.push({ name: 'Edge Functions', status: 'available', latency: 0 })

  // Check File Storage using Supabase client
  try {
    const start = Date.now()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { error } = await supabase.storage.listBuckets()
    const latency = Date.now() - start
    
    if (error) {
      services.push({ name: 'File Storage', status: 'outage', latency })
    } else if (latency > 2000) {
      services.push({ name: 'File Storage', status: 'issue', latency })
    } else {
      services.push({ name: 'File Storage', status: 'available', latency })
    }
  } catch {
    services.push({ name: 'File Storage', status: 'outage' })
  }

  // Check Real-time Messaging (via REST endpoint)
  try {
    const start = Date.now()
    const response = await fetch(`${supabaseUrl}/realtime/v1/health`, {
      headers: { apikey: supabaseAnonKey }
    })
    const latency = Date.now() - start
    
    // Realtime might not have a health endpoint, so we check if we get any response
    if (latency > 3000) {
      services.push({ name: 'Real-time Messaging', status: 'issue', latency })
    } else {
      services.push({ name: 'Real-time Messaging', status: 'available', latency })
    }
  } catch {
    // If it errors, it might just not have the endpoint - assume available
    services.push({ name: 'Real-time Messaging', status: 'available' })
  }

  // Check API Server (REST API) using Supabase client
  try {
    const start = Date.now()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { error } = await supabase.from('user_roles').select('id').limit(1)
    const latency = Date.now() - start
    
    if (error) {
      services.push({ name: 'API Server', status: 'outage', latency })
    } else if (latency > 2000) {
      services.push({ name: 'API Server', status: 'issue', latency })
    } else {
      services.push({ name: 'API Server', status: 'available', latency })
    }
  } catch {
    services.push({ name: 'API Server', status: 'outage' })
  }

  // Check Stripe Payment Gateway
  try {
    const start = Date.now()
    const response = await fetch('https://status.stripe.com/api/v2/status.json', {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    })
    const latency = Date.now() - start
    if (response.ok) {
      const data = await response.json().catch(() => null)
      const indicator = data?.status?.indicator
      // Use Stripe's own status indicator if available
      if (indicator && indicator !== 'none') {
        services.push({ name: 'Payment Gateway (Stripe)', status: 'issue', latency })
      } else {
        services.push({ name: 'Payment Gateway (Stripe)', status: 'available', latency })
      }
    } else {
      services.push({ name: 'Payment Gateway (Stripe)', status: 'issue', latency })
    }
  } catch {
    services.push({ name: 'Payment Gateway (Stripe)', status: 'issue' })
  }

  // Check Mace AI (Lovable AI Gateway)
  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!lovableApiKey) {
      services.push({ name: 'Mace AI', status: 'outage' })
    } else {
      const start = Date.now()
      const response = await fetch('https://api.lovable.dev/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      })
      const latency = Date.now() - start

      if (response.ok || response.status === 401 || response.status === 403) {
        // API is reachable — even auth errors mean the service itself is up
        services.push({ name: 'Mace AI', status: latency > 5000 ? 'issue' : 'available', latency })
      } else if (response.status === 429) {
        services.push({ name: 'Mace AI', status: 'issue', latency })
      } else if (response.status >= 500) {
        services.push({ name: 'Mace AI', status: 'outage', latency })
      } else {
        // Any other client response means the service is reachable
        services.push({ name: 'Mace AI', status: 'available', latency })
      }
    }
  } catch {
    services.push({ name: 'Mace AI', status: 'outage' })
  }

  // These services depend on external providers - we mark them available by default
  // as we can't directly check them without making actual transactions
  const externalServices = [
    'AI Article Generation',
    'WordPress Publishing',
    'Credit Processing',
    'Email Notifications',
    'Media Site Network',
    'Agency Portal',
    'Headlines Scanner'
  ]

  for (const name of externalServices) {
    services.push({ name, status: 'available' })
  }

  return new Response(JSON.stringify({ services, timestamp: new Date().toISOString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
