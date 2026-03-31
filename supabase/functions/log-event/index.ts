import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-shortcuts-token',
}

const DOGS = ['Babs', 'Moos']
const EVENT_TYPES = [
  'poep',
  'plas',
  'wandeling',
  'maaltijd',
  'training',
  'verzorging',
  'welzijn',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Gebruik POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: {
    token?: string
    dog?: string
    type?: string
    data?: Record<string, unknown>
    created_at?: string
  }

  try {
    payload = await req.json()
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Ongeldige JSON body.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const incomingToken =
    req.headers.get('x-shortcuts-token') || payload.token || ''
  const expectedToken = Deno.env.get('SHORTCUTS_TOKEN') || ''

  if (!expectedToken || incomingToken !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Ongeldige token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const dog = payload.dog?.trim()
  const type = payload.type?.trim()

  if (!dog || !DOGS.includes(dog)) {
    return new Response(JSON.stringify({ error: 'Onbekende hond.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!type || !EVENT_TYPES.includes(type)) {
    return new Response(JSON.stringify({ error: 'Onbekend type.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const created_at = payload.created_at || new Date().toISOString()
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    ''

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase keys ontbreken in de functie.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    global: { headers: { 'X-Client-Info': 'shortcuts-log-event' } },
    auth: { persistSession: false },
  })

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      dog,
      type,
      data,
      created_at,
    })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, event }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
