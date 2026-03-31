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
const PHOTO_BUCKET = 'hondenlogboek-photos'

const decodeBase64 = (value: string) => {
  const cleaned = value
    .replace(/^data:.*;base64,/, '')
    .replace(/[\r\n\s]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const binary = atob(cleaned)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const getExtension = (filename = '', mime = '') => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'png'
  if (lower.endsWith('.webp')) return 'webp'
  if (lower.endsWith('.heic')) return 'heic'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  return 'jpg'
}

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
    photo_base64?: string
    photo_filename?: string
    photo_mime?: string
    photo_tag?: string
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
    Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''

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

  if (payload.photo_base64) {
    const extension = getExtension(payload.photo_filename, payload.photo_mime)
    const filename = payload.photo_filename || `shortcut.${extension}`
    const path = `shortcuts/${dog}/${Date.now()}-${crypto.randomUUID()}.${extension}`
    const bytes = decodeBase64(payload.photo_base64)
    if (bytes.length < 1024) {
      return new Response(
        JSON.stringify({
          error:
            'Foto lijkt te klein of beschadigd. Controleer de Base64 stap in je Shortcut.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
    const contentType =
      payload.photo_mime || `image/${extension === 'jpg' ? 'jpeg' : extension}`
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType })

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: publicUrlData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(path)

    const existingPhotos = Array.isArray((data as { photos?: unknown }).photos)
      ? ((data as { photos?: unknown }).photos as Array<{ url?: string; tag?: string }>)
      : []
    const tag = payload.photo_tag || (type === 'welzijn' ? 'welzijn' : 'poep')
    const nextPhotos = [
      ...existingPhotos,
      { url: publicUrlData.publicUrl, tag },
    ]
    ;(data as { photos?: unknown }).photos = nextPhotos
    ;(data as { photo_filename?: string }).photo_filename = filename
  }

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
