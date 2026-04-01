// Hondenlogboek Scriptable widget
// Paste this into Scriptable (https://scriptable.app) and fill in the constants.
// Works with the public Supabase data (no auth).

const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'

const DOGS = ['Babs', 'Moos']
const WALK_SLOTS = [
  { key: 'morning', label: 'Ochtend', range: '04:01–12:00' },
  { key: 'afternoon', label: 'Middag', range: '12:01–16:00' },
  { key: 'evening', label: 'Avond', range: '16:01–20:30' },
  { key: 'late', label: 'Laat', range: '20:30–04:00' },
]

const formatter = new DateFormatter()
formatter.locale = 'nl-NL'
formatter.dateFormat = 'EEEE d MMM'

function walkSlotFor(date) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes >= 20 * 60 + 30 || minutes <= 4 * 60) return 'late'
  if (minutes >= 4 * 60 + 1 && minutes <= 12 * 60) return 'morning'
  if (minutes >= 12 * 60 + 1 && minutes <= 16 * 60) return 'afternoon'
  return 'evening'
}

function buildUrl(startISO, endISO) {
  const params = [
    'select=id,created_at,dog,type,data',
    `dog=in.(${DOGS.map(encodeURIComponent).join(',')})`,
    'type=in.(poep,maaltijd,verzorging)',
    `created_at=gte.${encodeURIComponent(startISO)}`,
    `created_at=lt.${encodeURIComponent(endISO)}`,
    'order=created_at.asc',
  ]
  return `${SUPABASE_URL}/rest/v1/events?${params.join('&')}`
}

async function fetchEvents() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const url = buildUrl(start.toISOString(), end.toISOString())

  const req = new Request(url)
  req.headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
  return await req.loadJSON()
}

function summarize(events) {
  const slots = WALK_SLOTS.reduce((acc, slot) => {
    acc[slot.key] = DOGS.reduce((dogAcc, dog) => {
      dogAcc[dog] = { poops: [], meals: [], teeth: 0 }
      return dogAcc
    }, {})
    return acc
  }, {})

  events.forEach((event) => {
    const date = new Date(event.created_at)
    const slotKey = walkSlotFor(date)
    const bucket = slots[slotKey]?.[event.dog]
    if (!bucket) return

    if (event.type === 'poep') {
      bucket.poops.push(event)
    } else if (event.type === 'maaltijd') {
      bucket.meals.push(event)
    } else if (event.type === 'verzorging') {
      if (event.data?.care_action === 'tanden poetsen') {
        bucket.teeth += 1
      }
    }
  })

  return slots
}

function formatMeal(event) {
  const data = event.data || {}
  if (data.meal_type === 'prutje') {
    const additives = (data.additives || []).join(', ')
    return `Prutje${additives ? ` (${additives})` : ''}`
  }
  if (data.main_meal || data.prutje) {
    const base = data.main_meal || 'Maaltijd'
    if (data.prutje) {
      const additives = (data.additives || []).join(', ')
      return `${base} + prutje${additives ? ` (${additives})` : ''}`
    }
    return base
  }
  return data.meal_type || 'Maaltijd'
}

function formatTime(value) {
  const date = new Date(value)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const widget = new ListWidget()
widget.backgroundColor = new Color('#fff7e6')
widget.setPadding(12, 12, 12, 12)

const title = widget.addText('Hondenlogboek')
title.font = Font.boldSystemFont(16)
title.textColor = new Color('#3a2618')

const subtitle = widget.addText(formatter.string(new Date()))
subtitle.font = Font.systemFont(11)
subtitle.textColor = new Color('#8b6b3e')

widget.addSpacer(8)

let events = []
try {
  events = await fetchEvents()
} catch (error) {
  const errorText = widget.addText('Fout bij laden')
  errorText.font = Font.systemFont(11)
  errorText.textColor = Color.red()
}

const slots = summarize(events)

WALK_SLOTS.forEach((slot, index) => {
  const slotStack = widget.addStack()
  slotStack.layoutVertically()
  const header = slotStack.addText(`${slot.label}`)
  header.font = Font.boldSystemFont(12)
  header.textColor = new Color('#3a2618')

  DOGS.forEach((dog) => {
    const bucket = slots[slot.key][dog]
    const poops = bucket.poops.length
    const teeth = bucket.teeth
    const meals = bucket.meals.map((event) => formatMeal(event))
    const mealSummary = meals.length ? meals.join(', ') : '—'

    const line = slotStack.addText(
      `${dog}: 💩 ${poops} • 🪥 ${teeth} • 🍽 ${mealSummary}`,
    )
    line.font = Font.systemFont(10)
    line.textColor = new Color('#6b4b2c')
  })

  if (index < WALK_SLOTS.length - 1) {
    widget.addSpacer(6)
  }
})

Script.setWidget(widget)
Script.complete()
