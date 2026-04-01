import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const DOGS = ['Babs', 'Moos']
const EVENT_TYPES = [
  { key: 'poep', label: 'Poep' },
  { key: 'plas', label: 'Plas' },
  { key: 'maaltijd', label: 'Maaltijd' },
  { key: 'training', label: 'Training' },
  { key: 'verzorging', label: 'Verzorging' },
  { key: 'welzijn', label: 'Welzijn' },
]

const EVENT_TYPE_LABELS = EVENT_TYPES.reduce((acc, item) => {
  acc[item.key] = item.label
  return acc
}, {})

const EVENT_TYPE_COLORS = {
  poep: 'bg-stone-600',
  plas: 'bg-sky-500',
  maaltijd: 'bg-orange-500',
  training: 'bg-indigo-500',
  verzorging: 'bg-rose-500',
  welzijn: 'bg-purple-500',
  tanden: 'bg-emerald-500',
}
const EVENT_TYPE_ICONS = {
  poep: 'P',
  plas: 'U',
  maaltijd: 'M',
  training: 'T',
  verzorging: 'V',
  welzijn: 'W',
  tanden: '🪥',
}
const DOG_BADGE_COLORS = {
  Babs: 'bg-amber-500',
  Moos: 'bg-sky-500',
}
const POOP_CONSISTENCY_COLORS = {
  goed: 'bg-emerald-500',
  zacht: 'bg-amber-400',
  diarree: 'bg-rose-500',
  anders: 'bg-slate-400',
}
const WELLBEING_SEVERITY_COLORS = {
  laag: 'bg-emerald-500',
  middel: 'bg-amber-400',
  hoog: 'bg-rose-500',
}

const POOP_CONSISTENCY = ['goed', 'zacht', 'diarree', 'anders']
const POOP_SIZE = ['klein', 'medium', 'groot']
const MEAL_BASE_TYPES = ['brokken', 'rauwvoer']
const PRUTJE_ADDITIVES = ['probiotica', 'sardineolie', 'psylliumvezels']
const WELLBEING_LEVELS = ['laag', 'middel', 'hoog']
const WELLBEING_TAGS = ['niet eten', 'kotsen', 'lusteloos']
const PHOTO_BUCKET = 'hondenlogboek-photos'
const TREND_DAYS = 30
const WALK_SLOTS = [
  { key: 'morning', label: 'Ochtendwandeling', range: '04:01–12:00' },
  { key: 'afternoon', label: 'Middagwandeling', range: '12:01–16:00' },
  { key: 'evening', label: 'Avondwandeling', range: '16:01–20:30' },
  { key: 'late', label: 'Late wandeling', range: '20:30–04:00' },
]
const WALK_GROUPS = [
  { key: 'poep', label: 'Poep', match: (event) => event.type === 'poep' },
  { key: 'plas', label: 'Plas', match: (event) => event.type === 'plas' },
  {
    key: 'maaltijd',
    label: 'Maaltijd',
    match: (event) => event.type === 'maaltijd',
  },
  {
    key: 'tanden',
    label: 'Tanden poetsen',
    match: (event) =>
      event.type === 'verzorging' &&
      event.data?.care_action === 'tanden poetsen',
  },
]

const DEFAULT_CARE_ACTIONS = [
  'borstelen',
  'blazen',
  'nagels knippen',
  'tanden poetsen',
]
const DEFAULT_TRAINING_TYPES = ['Algemeen']

const toDateKey = (value) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatTimeInput = (value) => {
  const date = new Date(value)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const buildTimestamp = (dateKey, timeValue) => {
  if (!dateKey || !timeValue) return undefined
  const [hours, minutes] = timeValue.split(':').map(Number)
  const date = new Date(`${dateKey}T00:00:00`)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

const getWeekStart = (value) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  return date
}

const getWalkSlot = (value) => {
  const date = new Date(value)
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes >= 20 * 60 + 30 || minutes <= 4 * 60) return 'late'
  if (minutes >= 4 * 60 + 1 && minutes <= 12 * 60) return 'morning'
  if (minutes >= 12 * 60 + 1 && minutes <= 16 * 60) return 'afternoon'
  return 'evening'
}

const formatLongDate = (value) =>
  new Date(value).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

const normalizePhotos = (photos, fallbackTag = '') => {
  if (!Array.isArray(photos)) return []
  return photos
    .map((photo) => {
      if (!photo) return null
      if (typeof photo === 'string') {
        return { url: photo, tag: fallbackTag }
      }
      if (typeof photo === 'object' && photo.url) {
        return { url: photo.url, tag: photo.tag || fallbackTag }
      }
      return null
    })
    .filter(Boolean)
}

const formatEventDetails = (event) => {
  const data = event.data || {}
  switch (event.type) {
    case 'poep':
      return `Consistentie: ${data.consistency || '-'} · Grootte: ${data.size || '-'}`
    case 'plas':
      return 'Plas'
    case 'maaltijd':
      if (data.meal_type === 'prutje') {
        const additives = (data.additives || []).join(', ')
        return `Prutje${additives ? ` (${additives})` : ''}`
      }
      if (data.main_meal || data.prutje) {
        const base = data.main_meal ? data.main_meal : ''
        const additives = (data.additives || []).join(', ')
        const prutjeLabel = data.prutje
          ? ` + prutje${additives ? ` (${additives})` : ''}`
          : ''
        return `${base || 'Maaltijd'}${prutjeLabel}`.trim()
      }
      return data.meal_type || 'Maaltijd'
    case 'training':
      return data.training_type || 'Training'
    case 'verzorging':
      return data.care_action || 'Verzorging'
    case 'welzijn':
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        return `Signalen: ${data.tags.join(', ')} · ${
          data.note || 'Korte notitie'
        }`
      }
      return `${data.severity || 'middel'} · ${data.note || 'Korte notitie'}`
    default:
      return 'Update'
  }
}

const emptySheetState = {
  open: false,
  mode: 'create',
  eventId: null,
  dog: null,
  type: null,
  date: '',
  time: '',
  data: {},
  error: '',
}

function App() {
  const [events, setEvents] = useState([])
  const [trainingTypes, setTrainingTypes] = useState([])
  const [careActions, setCareActions] = useState([])
  const [activeDog, setActiveDog] = useState('alle')
  const [activeType, setActiveType] = useState('alle')
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()))
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState(emptySheetState)
  const [mobileTab, setMobileTab] = useState('loggen')
  const [desktopTab, setDesktopTab] = useState('tijdlijn')
  const [newTrainingLabel, setNewTrainingLabel] = useState('')
  const [newCareLabel, setNewCareLabel] = useState('')
  const [toasts, setToasts] = useState([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [calendarView, setCalendarView] = useState('month')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarTypeFilter, setCalendarTypeFilter] = useState(
    EVENT_TYPES.map((type) => type.key),
  )
  const [calendarDogFilter, setCalendarDogFilter] = useState([...DOGS])
  const configMissing = !isSupabaseConfigured

  const upsertEvent = useCallback((record) => {
    setEvents((prev) => {
      const existing = prev.find((item) => item.id === record.id)
      if (existing) {
        return prev
          .map((item) => (item.id === record.id ? record : item))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      }
      return [record, ...prev].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      )
    })
  }, [])

  const addToast = useCallback((message, tone = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 2600)
  }, [])

  const uploadPhoto = useCallback(async (file, pathPrefix) => {
    if (!supabase || !file) return null
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${pathPrefix}/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase
      .storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { upsert: false })

    if (uploadError) {
      setSheet((prev) => ({
        ...prev,
        error: 'Foto upload mislukt. Je kunt alsnog opslaan zonder foto.',
      }))
      addToast('Uploaden van de foto mislukte.', 'error')
      return null
    }

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  }, [addToast])

  const uploadPhotos = useCallback(
    async (files, pathPrefix) => {
      if (!files?.length) return []
      const uploaded = []
      for (const file of files) {
        const url = await uploadPhoto(file, pathPrefix)
        if (url) {
          uploaded.push(url)
        }
      }
      return uploaded
    },
    [uploadPhoto],
  )

  useEffect(() => {
    if (!supabase) {
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setError('')
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 90)

      const [{ data: eventsData, error: eventsError },
        { data: trainingData, error: trainingError },
        { data: careData, error: careError },
      ] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('training_types').select('*').order('label'),
        supabase.from('care_actions').select('*').order('label'),
      ])

      if (eventsError || trainingError || careError) {
        setError('Oeps, laden mislukte. Controleer je Supabase instellingen.')
      }

      setEvents(eventsData || [])
      setTrainingTypes(trainingData || [])
      setCareActions(careData || [])
      setLoading(false)

      if ((trainingData || []).length === 0) {
        const { data: seededTraining } = await supabase
          .from('training_types')
          .insert(DEFAULT_TRAINING_TYPES.map((label) => ({ label })))
          .select()
        if (seededTraining?.length) {
          setTrainingTypes(seededTraining)
        }
      }

      if ((careData || []).length === 0) {
        const { data: seededCare } = await supabase
          .from('care_actions')
          .insert(DEFAULT_CARE_ACTIONS.map((label) => ({ label })))
          .select()
        if (seededCare?.length) {
          setCareActions(seededCare)
        }
      }
    }

    fetchData()

    const eventsChannel = supabase
      .channel('events-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setEvents((prev) => prev.filter((item) => item.id !== payload.old.id))
            return
          }
          upsertEvent(payload.new)
        },
      )
      .subscribe()

    const trainingChannel = supabase
      .channel('training-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_types' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setTrainingTypes((prev) =>
              prev.filter((item) => item.id !== payload.old.id),
            )
            return
          }
          const record = payload.new
          setTrainingTypes((prev) => {
            const existing = prev.find((item) => item.id === record.id)
            if (existing) {
              return prev
                .map((item) => (item.id === record.id ? record : item))
                .sort((a, b) => a.label.localeCompare(b.label))
            }
            return [...prev, record].sort((a, b) => a.label.localeCompare(b.label))
          })
        },
      )
      .subscribe()

    const careChannel = supabase
      .channel('care-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'care_actions' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setCareActions((prev) =>
              prev.filter((item) => item.id !== payload.old.id),
            )
            return
          }
          const record = payload.new
          setCareActions((prev) => {
            const existing = prev.find((item) => item.id === record.id)
            if (existing) {
              return prev
                .map((item) => (item.id === record.id ? record : item))
                .sort((a, b) => a.label.localeCompare(b.label))
            }
            return [...prev, record].sort((a, b) => a.label.localeCompare(b.label))
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(trainingChannel)
      supabase.removeChannel(careChannel)
    }
  }, [upsertEvent])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesDog = activeDog === 'alle' || event.dog === activeDog
      const matchesType = activeType === 'alle' || event.type === activeType
      const matchesDate = toDateKey(event.created_at) === selectedDate
      return matchesDog && matchesType && matchesDate
    })
  }, [events, activeDog, activeType, selectedDate])

  const timelineEvents = useMemo(() => {
    return [...filteredEvents].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )
  }, [filteredEvents])

  const weeklyTrends = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Array.from({ length: TREND_DAYS }).map((_, index) => {
      const date = new Date(today)
      date.setDate(date.getDate() - (TREND_DAYS - 1 - index))
      return {
        key: toDateKey(date),
        label: date.toLocaleDateString('nl-NL', {
          day: 'numeric',
        }),
        full: date.toLocaleDateString('nl-NL', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      }
    })

    return {
      days,
      dogs: DOGS.map((dog) => {
        const dogEvents = events.filter((event) => event.dog === dog)
        const poop = days.map((day) => {
          const dayEvents = dogEvents.filter(
            (event) => event.type === 'poep' && toDateKey(event.created_at) === day.key,
          )
          const total = dayEvents.length
          const hasPhoto = dayEvents.some((event) =>
            Array.isArray(event.data?.photos) && event.data.photos.length > 0
          )
          return { ...day, total, hasPhoto }
        })

        const wellbeing = days.map((day) => {
          const dayEvents = dogEvents.filter(
            (event) =>
              event.type === 'welzijn' && toDateKey(event.created_at) === day.key,
          )
          const severityValues = dayEvents
            .map((event) => event.data?.severity)
            .filter(Boolean)
          const severityScores = severityValues.map((value) => {
            if (value === 'hoog') return 3
            if (value === 'middel') return 2
            return 1
          })
          const avg =
            severityScores.length > 0
              ? severityScores.reduce((sum, score) => sum + score, 0) /
                severityScores.length
              : null
          return {
            ...day,
            total: dayEvents.length,
            avg,
          }
        })

        return { dog, poop, wellbeing }
      }),
    }
  }, [events])

  const openSheet = (dog, type) => {
    setError('')
    setNewTrainingLabel('')
    setNewCareLabel('')

    if (type === 'poep') {
      setSheet({
        open: true,
        mode: 'create',
        eventId: null,
        dog,
        type,
        date: '',
        time: '',
        data: { consistency: '', size: '', photos: [] },
        error: '',
      })
      return
    }

    if (type === 'maaltijd') {
      setSheet({
        open: true,
        mode: 'create',
        eventId: null,
        dog,
        type,
        date: '',
        time: '',
        data: { main_meal: 'brokken', prutje: false, additives: [] },
        error: '',
      })
      return
    }

    if (type === 'welzijn') {
      setSheet({
        open: true,
        mode: 'create',
        eventId: null,
        dog,
        type,
        date: '',
        time: '',
        data: { severity: 'middel', note: '', tags: [], photos: [] },
        error: '',
      })
      return
    }

    setSheet({
      open: true,
      mode: 'create',
      eventId: null,
      dog,
      type,
      date: '',
      time: '',
      data: {},
      error: '',
    })
  }

  const openEditSheet = (event) => {
    const data = event.data || {}
    setError('')
    setNewTrainingLabel('')
    setNewCareLabel('')

    if (event.type === 'poep') {
      setSheet({
        open: true,
        mode: 'edit',
        eventId: event.id,
        dog: event.dog,
        type: event.type,
        date: toDateKey(event.created_at),
        time: formatTimeInput(event.created_at),
        data: {
          consistency: data.consistency || '',
          size: data.size || '',
          photos: normalizePhotos(data.photos, 'poep'),
        },
        error: '',
      })
      return
    }

    if (event.type === 'maaltijd') {
      const legacyMeal = data.meal_type || ''
      const prutjeActive = data.prutje || legacyMeal === 'prutje'
      const baseMeal =
        data.main_meal ||
        (legacyMeal && legacyMeal !== 'prutje' ? legacyMeal : 'brokken')
      const additives = Array.isArray(data.additives)
        ? data.additives
        : prutjeActive
          ? PRUTJE_ADDITIVES
          : []
      setSheet({
        open: true,
        mode: 'edit',
        eventId: event.id,
        dog: event.dog,
        type: event.type,
        date: toDateKey(event.created_at),
        time: formatTimeInput(event.created_at),
        data: {
          main_meal: baseMeal,
          prutje: prutjeActive,
          additives,
        },
        error: '',
      })
      return
    }

    if (event.type === 'welzijn') {
      setSheet({
        open: true,
        mode: 'edit',
        eventId: event.id,
        dog: event.dog,
        type: event.type,
        date: toDateKey(event.created_at),
        time: formatTimeInput(event.created_at),
        data: {
          severity: data.severity || 'middel',
          note: data.note || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          photos: normalizePhotos(data.photos, 'welzijn'),
        },
        error: '',
      })
      return
    }

    if (event.type === 'training') {
      setSheet({
        open: true,
        mode: 'edit',
        eventId: event.id,
        dog: event.dog,
        type: event.type,
        date: toDateKey(event.created_at),
        time: formatTimeInput(event.created_at),
        data: { training_type: data.training_type || '' },
        error: '',
      })
      return
    }

    if (event.type === 'verzorging') {
      setSheet({
        open: true,
        mode: 'edit',
        eventId: event.id,
        dog: event.dog,
        type: event.type,
        date: toDateKey(event.created_at),
        time: formatTimeInput(event.created_at),
        data: { care_action: data.care_action || '' },
        error: '',
      })
      return
    }

    setSheet({
      open: true,
      mode: 'edit',
      eventId: event.id,
      dog: event.dog,
      type: event.type,
      date: toDateKey(event.created_at),
      time: formatTimeInput(event.created_at),
      data,
      error: '',
    })
  }

  const closeSheet = () => {
    setSheet(emptySheetState)
  }

  const openPhotoPreview = (url) => {
    if (!url) return
    setPhotoPreview(url)
  }

  const handleLogEvent = async ({ dog, type, data }) => {
    if (!supabase) {
      return
    }
    if (saving) return
    setSaving(true)
    setError('')

    const { data: inserted, error: insertError } = await supabase
      .from('events')
      .insert({ dog, type, data })
      .select()
      .single()

    if (insertError) {
      setError('Opslaan mislukte. Probeer het opnieuw.')
    } else if (inserted) {
      upsertEvent(inserted)
      addToast(
        `${EVENT_TYPE_LABELS[type] || type} gelogd voor ${dog}.`,
        'success',
      )
    }

    setSaving(false)
  }

  const handleUpdateEvent = async ({ id, dog, type, data, created_at }) => {
    if (!supabase) {
      return
    }
    if (saving) return
    setSaving(true)
    setError('')

    const updatePayload = { dog, type, data }
    if (created_at) {
      updatePayload.created_at = created_at
    }

    const { data: updated, error: updateError } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      setError('Bijwerken mislukte. Probeer het opnieuw.')
    } else if (updated) {
      upsertEvent(updated)
      addToast(`Log bijgewerkt voor ${dog}.`, 'success')
    }

    setSaving(false)
  }

  const handleDeleteEvent = async (eventId) => {
    if (!supabase) {
      return
    }
    const confirmed = window.confirm('Weet je zeker dat je deze log wilt verwijderen?')
    if (!confirmed) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      setError('Verwijderen mislukte. Probeer het opnieuw.')
    } else {
      setEvents((prev) => prev.filter((item) => item.id !== eventId))
      addToast('Log verwijderd.', 'success')
    }

    setSaving(false)
  }

  const logQuick = async (dog, type) => {
    await handleLogEvent({ dog, type, data: {} })
  }

  const logQuickCare = async (dog, care_action) => {
    await handleLogEvent({ dog, type: 'verzorging', data: { care_action } })
  }

  const handleAddTraining = async () => {
    if (!supabase) {
      return
    }
    const label = newTrainingLabel.trim()
    if (!label) {
      setSheet((prev) => ({ ...prev, error: 'Vul een trainingstype in.' }))
      return
    }
    if (
      trainingTypes.some((item) => item.label.toLowerCase() === label.toLowerCase())
    ) {
      setSheet((prev) => ({ ...prev, error: 'Dit trainingstype bestaat al.' }))
      return
    }
    const { error: insertError } = await supabase
      .from('training_types')
      .insert({ label })

    if (insertError) {
      setSheet((prev) => ({ ...prev, error: 'Toevoegen mislukt.' }))
      return
    }
    setNewTrainingLabel('')
    setSheet((prev) => ({ ...prev, error: '' }))
    addToast('Trainingstype toegevoegd.', 'success')
  }

  const handleAddCare = async () => {
    if (!supabase) {
      return
    }
    const label = newCareLabel.trim()
    if (!label) {
      setSheet((prev) => ({ ...prev, error: 'Vul een verzorgingsactie in.' }))
      return
    }
    if (careActions.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      setSheet((prev) => ({ ...prev, error: 'Deze actie bestaat al.' }))
      return
    }
    const { error: insertError } = await supabase
      .from('care_actions')
      .insert({ label })

    if (insertError) {
      setSheet((prev) => ({ ...prev, error: 'Toevoegen mislukt.' }))
      return
    }
    setNewCareLabel('')
    setSheet((prev) => ({ ...prev, error: '' }))
    addToast('Verzorgingsactie toegevoegd.', 'success')
  }

  const toggleCalendarType = (key) => {
    setCalendarTypeFilter((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    )
  }

  const toggleCalendarDog = (dog) => {
    setCalendarDogFilter((prev) =>
      prev.includes(dog) ? prev.filter((item) => item !== dog) : [...prev, dog],
    )
  }

  const exportCSV = () => {
    const rows = filteredEvents.map((event) => ({
      id: event.id,
      created_at: event.created_at,
      dog: event.dog,
      type: event.type,
      details: formatEventDetails(event),
    }))

    const header = ['id', 'created_at', 'dog', 'type', 'details']
    const escape = (value) =>
      `"${String(value || '')
        .replace(/\n/g, ' ')
        .replace(/"/g, '""')}"`

    const csv = [header.join(','), ...rows.map((row) => header.map((key) => escape(row[key])).join(','))].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hondenlogboek-${selectedDate}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const activeSummaryDate = formatLongDate(`${selectedDate}T12:00:00`)
  const isEdit = sheet.mode === 'edit'
  const editedTimestamp = isEdit ? buildTimestamp(sheet.date, sheet.time) : undefined
  const editDateLabel = sheet.date
    ? formatLongDate(`${sheet.date}T12:00:00`)
    : ''
  const isToday = selectedDate === toDateKey(new Date())
  const currentWalkKey = isToday ? getWalkSlot(new Date()) : null
  const walkTimeline = useMemo(() => {
    const slotMap = WALK_SLOTS.reduce((acc, slot) => {
      acc[slot.key] = {
        ...slot,
        dogs: DOGS.reduce((dogAcc, dog) => {
          dogAcc[dog] = []
          return dogAcc
        }, {}),
      }
      return acc
    }, {})
    const general = DOGS.reduce((acc, dog) => {
      acc[dog] = []
      return acc
    }, {})

    timelineEvents.forEach((event) => {
      const isWalkEvent =
        ['poep', 'plas', 'maaltijd'].includes(event.type) ||
        (event.type === 'verzorging' &&
          event.data?.care_action === 'tanden poetsen')
      if (isWalkEvent) {
        const slotKey = getWalkSlot(event.created_at)
        const slot = slotMap[slotKey]
        if (slot && slot.dogs[event.dog]) {
          slot.dogs[event.dog].push(event)
        }
        return
      }
      if (general[event.dog]) {
        general[event.dog].push(event)
      }
    })

    Object.values(slotMap).forEach((slot) => {
      DOGS.forEach((dog) => {
        slot.dogs[dog].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        )
      })
    })
    DOGS.forEach((dog) => {
      general[dog].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    })

    return {
      walks: WALK_SLOTS.map((slot) => slotMap[slot.key]),
      general,
    }
  }, [timelineEvents])

  const calendarEvents = useMemo(() => {
    return events.filter(
      (event) =>
        calendarTypeFilter.includes(event.type) &&
        calendarDogFilter.includes(event.dog),
    )
  }, [events, calendarTypeFilter, calendarDogFilter])

  const calendarMonthDays = useMemo(() => {
    const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1)
    const gridStart = getWeekStart(monthStart)
    return Array.from({ length: 42 }).map((_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      return date
    })
  }, [calendarDate])

  const calendarWeekDays = useMemo(() => {
    const start = getWeekStart(calendarDate)
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [calendarDate])

  const calendarLabel = useMemo(() => {
    if (calendarView === 'month') {
      return calendarDate.toLocaleDateString('nl-NL', {
        month: 'long',
        year: 'numeric',
      })
    }
    if (calendarView === 'week') {
      const start = calendarWeekDays[0]
      const end = calendarWeekDays[calendarWeekDays.length - 1]
      return `${start.toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
      })} – ${end.toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
      })}`
    }
    return formatLongDate(calendarDate)
  }, [calendarDate, calendarView, calendarWeekDays])

  const shiftCalendar = (direction) => {
    setCalendarDate((prev) => {
      const next = new Date(prev)
      if (calendarView === 'month') {
        next.setMonth(next.getMonth() + direction)
      } else if (calendarView === 'week') {
        next.setDate(next.getDate() + direction * 7)
      } else {
        next.setDate(next.getDate() + direction)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-28 pt-6 md:pb-16 md:pt-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-amber-700">
              Hondenlogboek
            </p>
            <h1 className="mt-2 text-2xl font-semibold md:text-5xl">Babs & Moos</h1>
            <p className="mt-2 hidden max-w-lg text-sm text-amber-800 sm:block">
              Snel loggen met één tik, realtime delen en overzicht per dag en week.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {[
              { key: 'loggen', label: 'Loggen' },
              { key: 'tijdlijn', label: 'Tijdlijn' },
              { key: 'week', label: 'Trends' },
              { key: 'kalender', label: 'Kalender' },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`chip ${desktopTab === tab.key ? 'chip-active' : ''}`}
                onClick={() => setDesktopTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="app-card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        {configMissing ? (
          <div className="app-card border-amber-300 bg-white/90 px-4 py-3 text-sm text-amber-900">
            Voeg je Supabase URL en anon key toe in `.env.local` om te starten.
          </div>
        ) : null}

        <main className="flex flex-col gap-6">
          <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div
              className={`app-card space-y-4 p-4 md:p-5 ${
                mobileTab === 'loggen' ? '' : 'hidden'
              } ${desktopTab === 'loggen' ? 'md:block' : 'md:hidden'}`}
            >
              <div>
                <h2 className="text-2xl font-semibold">Snelle log</h2>
                <p className="mt-1 hidden text-sm text-amber-800 md:block">
                  Tik op een knop per hond. Extra details open je in een korte slide.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4">
                {DOGS.map((dog) => (
                  <div
                    key={dog}
                    className="rounded-3xl border border-amber-200/70 bg-amber-50/60 p-3 md:p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
                          {dog}
                        </p>
                        <h3 className="mt-1 text-base font-semibold md:text-xl">
                          Snelle acties
                        </h3>
                      </div>
                      <span className="chip hidden md:inline-flex">1-tik</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4 md:flex md:flex-wrap md:gap-2">
                      <button
                        className="btn btn-primary px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'poep')}
                        disabled={saving || configMissing}
                      >
                        Poep
                      </button>
                      <button
                        className="btn btn-muted px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => logQuick(dog, 'plas')}
                        disabled={saving || configMissing}
                      >
                        Plas
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'maaltijd')}
                        disabled={saving || configMissing}
                      >
                        Maaltijd
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'training')}
                        disabled={saving || configMissing}
                      >
                        Training
                      </button>
                      <button
                        className="btn btn-muted px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => logQuickCare(dog, 'tanden poetsen')}
                        disabled={saving || configMissing}
                      >
                        Tanden poetsen
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'verzorging')}
                        disabled={saving || configMissing}
                      >
                        Verzorging
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'welzijn')}
                        disabled={saving || configMissing}
                      >
                        Welzijn
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`app-card space-y-5 p-5 ${
                mobileTab === 'tijdlijn' ? '' : 'hidden'
              } ${desktopTab === 'tijdlijn' ? 'md:block' : 'md:hidden'}`}
            >
              <div>
                <h2 className="text-2xl font-semibold">Filters</h2>
                <p className="mt-1 text-sm text-amber-800">
                  Filter op hond, type en dag.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={`chip ${activeDog === 'alle' ? 'chip-active' : ''}`}
                    onClick={() => setActiveDog('alle')}
                  >
                    Alle honden
                  </button>
                  {DOGS.map((dog) => (
                    <button
                      key={dog}
                      className={`chip ${activeDog === dog ? 'chip-active' : ''}`}
                      onClick={() => setActiveDog(dog)}
                    >
                      {dog}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={`chip ${activeType === 'alle' ? 'chip-active' : ''}`}
                    onClick={() => setActiveType('alle')}
                  >
                    Alle types
                  </button>
                  {EVENT_TYPES.map((type) => (
                    <button
                      key={type.key}
                      className={`chip ${activeType === type.key ? 'chip-active' : ''}`}
                      onClick={() => setActiveType(type.key)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-amber-600">
                    Dag
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-amber-200/70 pt-4">
                <button className="btn btn-primary w-full" onClick={exportCSV}>
                  Exporteer CSV (gefilterd)
                </button>
                <p className="mt-2 text-xs text-amber-700">
                  Handig voor overleg met dierenarts of opvang.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div
              className={`app-card space-y-3 p-4 sm:space-y-4 sm:p-5 ${
                mobileTab === 'tijdlijn' ? '' : 'hidden'
              } ${desktopTab === 'tijdlijn' ? 'md:block' : 'md:hidden'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">Tijdlijn</h2>
                  <p className="mt-1 text-sm text-amber-800">{activeSummaryDate}</p>
                </div>
                <span className="chip">{timelineEvents.length} meldingen</span>
              </div>
              {loading ? (
                <p className="text-sm text-amber-700">Bezig met laden...</p>
              ) : timelineEvents.length === 0 ? (
                <p className="text-sm text-amber-700">
                  Geen logs op deze dag.
                </p>
              ) : (
                <div className="mt-4 rounded-3xl border border-amber-200/70 bg-white/80 p-3 sm:p-4">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-amber-600 sm:text-xs">
                    <span>4 wandelmomenten</span>
                    <span>Tik om te bewerken</span>
                  </div>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-[10px] uppercase tracking-[0.2em] text-amber-600 sm:text-xs">
                      <span>Babs</span>
                      <span>Moos</span>
                    </div>
                    {walkTimeline.walks.map((slot) => (
                      <div
                        key={slot.key}
                        className={`rounded-2xl border border-amber-100 bg-amber-50/60 p-3 ${
                          currentWalkKey === slot.key ? 'bg-amber-100/70' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
                              {slot.label}
                            </p>
                            <p className="text-[11px] text-amber-600">{slot.range}</p>
                          </div>
                          {currentWalkKey === slot.key ? (
                            <span className="chip px-3 py-1 text-[10px]">Nu</span>
                          ) : null}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {DOGS.map((dog) => {
                            const events = slot.dogs[dog] || []
                            const grouped = WALK_GROUPS.map((group) => ({
                              type: group.key,
                              label: group.label,
                              events: events.filter(group.match),
                            })).filter((group) => group.events.length > 0)
                            return (
                              <div
                                key={`${slot.key}-${dog}`}
                                className="relative min-w-0 rounded-2xl border border-amber-100 bg-white/70 p-2"
                              >
                                <div className="space-y-2">
                                  {events.length === 0 ? (
                                    <div className="h-6 rounded-xl border border-dashed border-amber-200/70 bg-white/80" />
                                  ) : (
                                    grouped.map((group) => {
                                      const color =
                                        EVENT_TYPE_COLORS[group.type] ||
                                        'bg-amber-600'
                                      return (
                                        <div
                                          key={`${slot.key}-${dog}-${group.type}`}
                                          className="rounded-2xl border border-amber-200/70 bg-white/95 px-2 py-2 shadow-sm"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-amber-600">
                                            <div className="flex items-center gap-2">
                                              <span
                                                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white ${color}`}
                                              >
                                                {EVENT_TYPE_ICONS[group.type] || ''}
                                              </span>
                                              <span className="chip px-2 py-1 text-[9px]">
                                                {group.label}
                                              </span>
                                            </div>
                                            {group.type !== 'maaltijd' ? (
                                              <span className="text-[10px] text-amber-700">
                                                {group.events.length}x
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="mt-2 space-y-1 text-xs text-amber-900">
                                            {group.events.map((event) => {
                                              const details = formatEventDetails(event)
                                              const showDetails =
                                                details &&
                                                details.trim().toLowerCase() !==
                                                  group.label.trim().toLowerCase()
                                              const photos = normalizePhotos(
                                                event.data?.photos,
                                                event.type === 'poep'
                                                  ? 'poep'
                                                  : 'welzijn',
                                              )
                                              return (
                                                <div key={event.id} className="space-y-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => openEditSheet(event)}
                                                    className="w-full min-w-0 text-left"
                                                  >
                                                    <div className="text-xs text-amber-900">
                                                      <span className="font-semibold">
                                                        {formatTimeInput(
                                                          event.created_at,
                                                        )}
                                                      </span>
                                                      {showDetails ? (
                                                        <span className="mt-0.5 block break-words text-amber-700 whitespace-normal">
                                                          {details}
                                                        </span>
                                                      ) : null}
                                                    </div>
                                                  </button>
                                                  {photos.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                      {photos.map((photo) => (
                                                        <img
                                                          key={photo.url}
                                                          src={photo.url}
                                                          alt="Log foto"
                                                          className="h-7 w-7 rounded-2xl object-cover"
                                                          onClick={(event) => {
                                                            event.stopPropagation()
                                                            openPhotoPreview(photo.url)
                                                          }}
                                                        />
                                                      ))}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-2xl border border-amber-100 bg-white/70 p-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
                          Algemeen (dag)
                        </p>
                        <p className="text-[11px] text-amber-600">
                          Training, verzorging, welzijn en andere notities.
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {DOGS.map((dog) => {
                          const events = walkTimeline.general[dog] || []
                          return (
                            <div
                              key={`general-${dog}`}
                              className="rounded-2xl border border-amber-100 bg-white/80 p-2"
                            >
                              <div className="space-y-2">
                                {events.length === 0 ? (
                                  <div className="h-6 rounded-xl border border-dashed border-amber-200/70 bg-white/80" />
                                ) : (
                                  events.map((event) => {
                                    const typeLabel =
                                      EVENT_TYPE_LABELS[event.type] || event.type
                                    const details = formatEventDetails(event)
                                    const showDetails =
                                      details &&
                                      details.trim().toLowerCase() !==
                                        typeLabel.trim().toLowerCase()
                                    const photos = normalizePhotos(
                                      event.data?.photos,
                                      event.type === 'poep'
                                        ? 'poep'
                                        : 'welzijn',
                                    )
                                    const color =
                                      EVENT_TYPE_COLORS[event.type] ||
                                      'bg-amber-600'
                                    return (
                                      <button
                                        key={event.id}
                                        type="button"
                                        onClick={() => openEditSheet(event)}
                                        className="w-full rounded-2xl border border-amber-200/70 bg-white/95 px-2 py-2 text-left shadow-sm"
                                      >
                                        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber-600">
                                          <span>{formatTimeInput(event.created_at)}</span>
                                          <span
                                            className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white ${color}`}
                                          >
                                            {EVENT_TYPE_ICONS[event.type] || ''}
                                          </span>
                                          <span className="chip px-2 py-1 text-[9px]">
                                            {typeLabel}
                                          </span>
                                        </div>
                                        {showDetails ? (
                                          <p className="mt-2 text-xs text-amber-900 sm:text-sm break-words">
                                            {details}
                                          </p>
                                        ) : null}
                                        {photos.length > 0 ? (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                              {photos.map((photo) => (
                                                <img
                                                  key={photo.url}
                                                  src={photo.url}
                                                  alt="Log foto"
                                                  className="h-8 w-8 rounded-2xl object-cover"
                                                  onClick={(event) => {
                                                    event.stopPropagation()
                                                    openPhotoPreview(photo.url)
                                                  }}
                                                />
                                              ))}
                                            </div>
                                          ) : null}
                                      </button>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`app-card space-y-4 p-5 ${
                mobileTab === 'week' ? '' : 'hidden'
              } ${desktopTab === 'week' ? 'md:block' : 'md:hidden'}`}
            >
              <div>
                <h2 className="text-2xl font-semibold">Trends</h2>
                <p className="mt-1 text-sm text-amber-800">
                  Laatste 30 dagen met focus op poep en welzijn.
                </p>
              </div>
              <div className="space-y-3">
                {weeklyTrends.dogs.map((dogSummary) => (
                  <div
                    key={dogSummary.dog}
                    className="rounded-3xl border border-amber-200/70 bg-white/80 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{dogSummary.dog}</h3>
                      <span className="chip">30 dagen</span>
                    </div>
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                          Poeptrend (incl. foto)
                        </p>
                        <div className="mt-3 flex items-end gap-1">
                          {dogSummary.poop.map((day) => {
                            const height =
                              day.total === 0
                                ? 2
                                : Math.min(28, 4 + day.total * 4)
                            const color =
                              day.total === 0 ? 'bg-amber-200' : 'bg-stone-600'
                            return (
                              <div key={day.key} className="flex flex-col items-center">
                                <div className="mb-1 h-1">
                                  {day.hasPhoto ? (
                                    <span className="block h-1 w-1 rounded-full bg-rose-500" />
                                  ) : (
                                    <span className="block h-1 w-1 opacity-0" />
                                  )}
                                </div>
                                <div
                                  className={`w-2 rounded-full ${color}`}
                                  style={{ height }}
                                  title={day.full}
                                />
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-2 flex justify-between text-[10px] text-amber-500">
                          <span>{weeklyTrends.days[0].label}</span>
                          <span>{weeklyTrends.days[weeklyTrends.days.length - 1].label}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                          Welzijn trend
                        </p>
                        <div className="mt-3 flex items-end gap-1">
                          {dogSummary.wellbeing.map((day) => {
                            const avg = day.avg
                            const color =
                              avg === null
                                ? 'bg-amber-200'
                                : avg >= 2.6
                                  ? WELLBEING_SEVERITY_COLORS.hoog
                                  : avg >= 1.6
                                    ? WELLBEING_SEVERITY_COLORS.middel
                                    : WELLBEING_SEVERITY_COLORS.laag
                            const height =
                              avg === null ? 2 : Math.round(4 + avg * 6)
                            return (
                              <div key={day.key} className="flex flex-col items-center">
                                <div
                                  className={`w-2 rounded-full ${color}`}
                                  style={{ height }}
                                  title={day.full}
                                />
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-2 flex justify-between text-[10px] text-amber-500">
                          <span>{weeklyTrends.days[0].label}</span>
                          <span>{weeklyTrends.days[weeklyTrends.days.length - 1].label}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={`${desktopTab === 'kalender' ? 'hidden md:block' : 'hidden'}`}>
            <div className="app-card space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">Kalender</h2>
                  <p className="mt-1 text-sm text-amber-800">
                    Overzicht per maand, week of dag.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'month', label: 'Maand' },
                    { key: 'week', label: 'Week' },
                    { key: 'day', label: 'Dag' },
                  ].map((view) => (
                    <button
                      key={view.key}
                      className={`chip ${
                        calendarView === view.key ? 'chip-active' : ''
                      }`}
                      onClick={() => setCalendarView(view.key)}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button className="btn btn-ghost" onClick={() => shiftCalendar(-1)}>
                  Vorige
                </button>
                <span className="text-sm font-semibold text-amber-900">
                  {calendarLabel}
                </span>
                <button className="btn btn-ghost" onClick={() => shiftCalendar(1)}>
                  Volgende
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Filters
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="chip"
                    onClick={() => setCalendarDogFilter([...DOGS])}
                  >
                    Alle honden
                  </button>
                  {DOGS.map((dog) => (
                    <button
                      key={dog}
                      className={`chip ${
                        calendarDogFilter.includes(dog) ? 'chip-active' : ''
                      }`}
                      onClick={() => toggleCalendarDog(dog)}
                    >
                      {dog}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="chip"
                    onClick={() =>
                      setCalendarTypeFilter(EVENT_TYPES.map((type) => type.key))
                    }
                  >
                    Alle acties
                  </button>
                  {EVENT_TYPES.map((type) => (
                    <button
                      key={type.key}
                      className={`chip ${
                        calendarTypeFilter.includes(type.key) ? 'chip-active' : ''
                      }`}
                      onClick={() => toggleCalendarType(type.key)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {calendarView === 'month' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-7 gap-2 text-xs text-amber-600">
                    {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((label) => (
                      <span key={label} className="text-center uppercase">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {calendarMonthDays.map((date) => {
                      const dateKey = toDateKey(date)
                      const dayEvents = calendarEvents.filter(
                        (event) => toDateKey(event.created_at) === dateKey,
                      )
                      const isCurrentMonth =
                        date.getMonth() === calendarDate.getMonth()
                      const isTodayCell =
                        toDateKey(date) === toDateKey(new Date())
                      const photos = dayEvents.flatMap((event) =>
                        normalizePhotos(event.data?.photos),
                      )
                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => {
                            setCalendarDate(date)
                            setCalendarView('day')
                          }}
                          className={`min-h-[120px] rounded-2xl border border-amber-100/80 p-2 text-left ${
                            isCurrentMonth
                              ? 'bg-white/90'
                              : 'bg-amber-50/70 text-amber-400'
                          } ${isTodayCell ? 'ring-2 ring-amber-300' : ''}`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
                            <span>{date.getDate()}</span>
                            <div className="flex gap-1">
                              {DOGS.map((dog) => {
                                const count = dayEvents.filter(
                                  (event) => event.dog === dog,
                                ).length
                                if (!count) return null
                                return (
                                  <span
                                    key={`${dateKey}-${dog}`}
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white ${
                                      DOG_BADGE_COLORS[dog] || 'bg-amber-500'
                                    }`}
                                  >
                                    {count}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {dayEvents.slice(0, 6).map((event) => (
                              <span
                                key={event.id}
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white ${
                                  EVENT_TYPE_COLORS[event.type] || 'bg-amber-500'
                                }`}
                              >
                                {EVENT_TYPE_ICONS[event.type] || ''}
                              </span>
                            ))}
                          </div>
                          {photos.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {photos.slice(0, 3).map((photo) => (
                                <img
                                  key={photo.url}
                                  src={photo.url}
                                  alt="Dag foto"
                                  className="h-8 w-8 rounded-lg object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {calendarView === 'week' ? (
                <div className="grid grid-cols-7 gap-3">
                  {calendarWeekDays.map((date) => {
                    const dateKey = toDateKey(date)
                    const dayEvents = calendarEvents.filter(
                      (event) => toDateKey(event.created_at) === dateKey,
                    )
                    return (
                      <div
                        key={dateKey}
                        className="rounded-2xl border border-amber-100/70 bg-white/90 p-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setCalendarDate(date)
                            setCalendarView('day')
                          }}
                          className="w-full text-left"
                        >
                          <p className="text-xs font-semibold text-amber-700">
                            {date.toLocaleDateString('nl-NL', {
                              weekday: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </button>
                        <div className="mt-2 space-y-2">
                          {dayEvents.length === 0 ? (
                            <p className="text-[10px] text-amber-400">Geen logs</p>
                          ) : (
                            dayEvents.slice(0, 6).map((event) => {
                              const photos = normalizePhotos(event.data?.photos)
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => openEditSheet(event)}
                                  className="flex w-full flex-wrap items-center gap-1 text-[10px] text-amber-800"
                                >
                                  <span
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white ${
                                      EVENT_TYPE_COLORS[event.type] || 'bg-amber-500'
                                    }`}
                                  >
                                    {EVENT_TYPE_ICONS[event.type] || ''}
                                  </span>
                                  <span className="font-semibold">
                                    {formatTimeInput(event.created_at)}
                                  </span>
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold text-white ${
                                      DOG_BADGE_COLORS[event.dog] || 'bg-amber-500'
                                    }`}
                                  >
                                    {event.dog}
                                  </span>
                                  <span className="truncate text-[10px] text-amber-700">
                                    {EVENT_TYPE_LABELS[event.type] || event.type}
                                  </span>
                                  {photos[0] ? (
                                    <img
                                      src={photos[0].url}
                                      alt="Log foto"
                                      className="ml-auto h-5 w-5 rounded-md object-cover"
                                    />
                                  ) : null}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {calendarView === 'day' ? (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-amber-900">
                    {formatLongDate(calendarDate)}
                  </h3>
                  <div className="space-y-2">
                    {calendarEvents
                      .filter(
                        (event) =>
                          toDateKey(event.created_at) === toDateKey(calendarDate),
                      )
                      .sort(
                        (a, b) =>
                          new Date(a.created_at) - new Date(b.created_at),
                      )
                      .map((event) => {
                        const details = formatEventDetails(event)
                        const photos = normalizePhotos(event.data?.photos)
                        return (
                          <div
                            key={event.id}
                            className="rounded-2xl border border-amber-100 bg-white/90 p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-600">
                              <span
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white ${
                                  EVENT_TYPE_COLORS[event.type] || 'bg-amber-500'
                                }`}
                              >
                                {EVENT_TYPE_ICONS[event.type] || ''}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                                  DOG_BADGE_COLORS[event.dog] || 'bg-amber-500'
                                }`}
                              >
                                {event.dog}
                              </span>
                              <span>{formatTimeInput(event.created_at)}</span>
                            </div>
                            <p className="mt-2 text-sm text-amber-900">
                              {details}
                            </p>
                            {photos.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {photos.map((photo) => (
                                  <img
                                    key={photo.url}
                                    src={photo.url}
                                    alt="Log foto"
                                    className="h-12 w-12 rounded-2xl object-cover"
                                    onClick={() => openPhotoPreview(photo.url)}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-amber-200 bg-white/90 px-4 py-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 pb-[env(safe-area-inset-bottom)]">
          <button
            className={`btn w-full ${
              mobileTab === 'loggen' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setMobileTab('loggen')}
          >
            Loggen
          </button>
          <button
            className={`btn w-full ${
              mobileTab === 'tijdlijn' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setMobileTab('tijdlijn')}
          >
            Tijdlijn
          </button>
          <button
            className={`btn w-full ${
              mobileTab === 'week' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setMobileTab('week')}
          >
            Week
          </button>
        </div>
      </nav>

      {photoPreview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPhotoPreview(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={photoPreview}
              alt="Vergrote foto"
              className="max-h-[90vh] max-w-[90vw] rounded-3xl object-contain shadow-2xl"
            />
            <button
              type="button"
              className="btn btn-ghost absolute -right-2 -top-2 bg-white/90"
              onClick={() => setPhotoPreview(null)}
            >
              Sluiten
            </button>
          </div>
        </div>
      ) : null}

      {sheet.open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="app-card w-full max-w-xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-amber-600">
                  {sheet.dog}
                </p>
                <h3 className="mt-1 text-xl font-semibold">
                  {sheet.type === 'poep' && (isEdit ? 'Poep wijzigen' : 'Poep loggen')}
                  {sheet.type === 'maaltijd' &&
                    (isEdit ? 'Maaltijd wijzigen' : 'Maaltijd loggen')}
                  {sheet.type === 'training' &&
                    (isEdit ? 'Training wijzigen' : 'Training loggen')}
                  {sheet.type === 'verzorging' &&
                    (isEdit ? 'Verzorging wijzigen' : 'Verzorging loggen')}
                  {sheet.type === 'welzijn' &&
                    (isEdit ? 'Welzijn wijzigen' : 'Welzijn loggen')}
                  {sheet.type === 'plas' && (isEdit ? 'Log wijzigen' : 'Log toevoegen')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isEdit ? (
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      await handleDeleteEvent(sheet.eventId)
                      closeSheet()
                    }}
                  >
                    Verwijderen
                  </button>
                ) : null}
                <button className="btn btn-ghost" onClick={closeSheet}>
                  Sluiten
                </button>
              </div>
            </div>

            {isEdit ? (
              <div>
                <p className="text-sm font-semibold text-amber-900">Hond</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DOGS.map((dog) => (
                    <button
                      key={dog}
                      className={`chip ${sheet.dog === dog ? 'chip-active' : ''}`}
                      onClick={() =>
                        setSheet((prev) => ({
                          ...prev,
                          dog,
                        }))
                      }
                    >
                      {dog}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Tijd</p>
                    <input
                      className="input mt-2 w-[140px]"
                      type="time"
                      value={sheet.time}
                      onChange={(event) =>
                        setSheet((prev) => ({
                          ...prev,
                          time: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
                    {editDateLabel}
                  </p>
                </div>
              </div>
            ) : null}

            {sheet.type === 'poep' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Consistentie</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {POOP_CONSISTENCY.map((item) => (
                      <button
                        key={item}
                        className={`chip ${
                          sheet.data.consistency === item ? 'chip-active' : ''
                        }`}
                        onClick={() =>
                          setSheet((prev) => ({
                            ...prev,
                            data: { ...prev.data, consistency: item },
                            error: '',
                          }))
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">Grootte</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {POOP_SIZE.map((item) => (
                      <button
                        key={item}
                        className={`chip ${
                          sheet.data.size === item ? 'chip-active' : ''
                        }`}
                        onClick={() =>
                          setSheet((prev) => ({
                            ...prev,
                            data: { ...prev.data, size: item },
                            error: '',
                          }))
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Foto (optioneel)
                  </p>
                  {Array.isArray(sheet.data.photos) &&
                  sheet.data.photos.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sheet.data.photos.map((photo) => (
                        <div key={photo.url} className="relative">
                          <img
                            src={photo.url}
                            alt="Poep foto"
                            className="h-16 w-16 rounded-2xl object-cover"
                            onClick={() => openPhotoPreview(photo.url)}
                          />
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white text-xs font-semibold text-amber-900 shadow"
                            onClick={() =>
                              setSheet((prev) => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  photos: prev.data.photos.filter(
                                    (item) => item.url !== photo.url,
                                  ),
                                },
                              }))
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <input
                    className="input mt-2"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || [])
                      if (!files.length) return
                      setPhotoUploading(true)
                      const urls = await uploadPhotos(
                        files,
                        `poep/${sheet.dog || 'onbekend'}`,
                      )
                      if (urls.length) {
                        setSheet((prev) => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            photos: [
                              ...(prev.data.photos || []),
                              ...urls.map((url) => ({ url, tag: 'poep' })),
                            ],
                          },
                        }))
                      }
                      setPhotoUploading(false)
                      event.target.value = ''
                    }}
                    disabled={photoUploading || configMissing}
                  />
                </div>
                {sheet.error ? (
                  <p className="text-sm text-amber-700">{sheet.error}</p>
                ) : null}
                <button
                  className="btn btn-primary w-full"
                  disabled={
                    !sheet.data.consistency ||
                    !sheet.data.size ||
                    saving ||
                    photoUploading
                  }
                  onClick={async () => {
                    if (!sheet.data.consistency || !sheet.data.size) {
                      setSheet((prev) => ({
                        ...prev,
                        error: 'Kies consistentie en grootte.',
                      }))
                      return
                    }
                    const payload = {
                      dog: sheet.dog,
                      type: 'poep',
                      data: {
                        consistency: sheet.data.consistency,
                        size: sheet.data.size,
                        photos: sheet.data.photos || [],
                      },
                    }
                    if (isEdit) {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        ...payload,
                        created_at: editedTimestamp,
                      })
                    } else {
                      await handleLogEvent(payload)
                    }
                    closeSheet()
                  }}
                >
                  {isEdit ? 'Wijzigingen opslaan' : 'Poep opslaan'}
                </button>
              </div>
            ) : null}

            {sheet.type === 'maaltijd' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Basis maaltijd
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MEAL_BASE_TYPES.map((item) => (
                      <button
                        key={item}
                        className={`chip ${
                          sheet.data.main_meal === item ? 'chip-active' : ''
                        }`}
                        onClick={() =>
                          setSheet((prev) => ({
                            ...prev,
                            data: {
                              ...prev.data,
                              main_meal: item,
                            },
                            error: '',
                          }))
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Prutje erbij?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className={`chip ${
                        sheet.data.prutje ? 'chip-active' : ''
                      }`}
                      onClick={() =>
                        setSheet((prev) => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            prutje: !prev.data.prutje,
                            additives: !prev.data.prutje
                              ? prev.data.additives.length
                                ? prev.data.additives
                                : PRUTJE_ADDITIVES
                              : [],
                          },
                        }))
                      }
                    >
                      Prutje
                    </button>
                  </div>
                </div>
                {sheet.data.prutje ? (
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Additieven (voorgeselecteerd)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PRUTJE_ADDITIVES.map((item) => {
                        const active = sheet.data.additives.includes(item)
                        return (
                          <button
                            key={item}
                            className={`chip ${active ? 'chip-active' : ''}`}
                            onClick={() =>
                              setSheet((prev) => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  additives: active
                                    ? prev.data.additives.filter(
                                        (value) => value !== item,
                                      )
                                    : [...prev.data.additives, item],
                                },
                              }))
                            }
                          >
                            {item}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                <button
                  className="btn btn-primary w-full"
                  onClick={async () => {
                    const payload = {
                      dog: sheet.dog,
                      type: 'maaltijd',
                      data: {
                        main_meal: sheet.data.main_meal,
                        prutje: sheet.data.prutje,
                        additives: sheet.data.additives,
                      },
                    }
                    if (isEdit) {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        ...payload,
                        created_at: editedTimestamp,
                      })
                    } else {
                      await handleLogEvent(payload)
                    }
                    closeSheet()
                  }}
                >
                  {isEdit ? 'Wijzigingen opslaan' : 'Maaltijd opslaan'}
                </button>
              </div>
            ) : null}

            {sheet.type === 'training' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Trainingstype
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {trainingTypes.map((item) => (
                      <button
                        key={item.id}
                        className={`chip ${
                          sheet.data.training_type === item.label ? 'chip-active' : ''
                        }`}
                        onClick={async () => {
                          const payload = {
                            dog: sheet.dog,
                            type: 'training',
                            data: { training_type: item.label },
                          }
                          if (isEdit) {
                            await handleUpdateEvent({
                              id: sheet.eventId,
                              ...payload,
                              created_at: editedTimestamp,
                            })
                          } else {
                            await handleLogEvent(payload)
                          }
                          closeSheet()
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
                    Nieuw type
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      className="input"
                      value={newTrainingLabel}
                      onChange={(event) => setNewTrainingLabel(event.target.value)}
                      placeholder="Bijv. zoeken, focus, apport"
                    />
                    <button className="btn btn-ghost" onClick={handleAddTraining}>
                      Trainingstype toevoegen
                    </button>
                  </div>
                </div>
                {sheet.error ? (
                  <p className="text-sm text-amber-700">{sheet.error}</p>
                ) : null}
                {isEdit ? (
                  <button
                    className="btn btn-primary w-full"
                    disabled={!sheet.data.training_type}
                    onClick={async () => {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        dog: sheet.dog,
                        type: 'training',
                        data: { training_type: sheet.data.training_type },
                        created_at: editedTimestamp,
                      })
                      closeSheet()
                    }}
                  >
                    Wijzigingen opslaan
                  </button>
                ) : null}
              </div>
            ) : null}

            {sheet.type === 'verzorging' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Verzorgingsactie
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {careActions.map((item) => (
                      <button
                        key={item.id}
                        className={`chip ${
                          sheet.data.care_action === item.label ? 'chip-active' : ''
                        }`}
                        onClick={async () => {
                          const payload = {
                            dog: sheet.dog,
                            type: 'verzorging',
                            data: { care_action: item.label },
                          }
                          if (isEdit) {
                            await handleUpdateEvent({
                              id: sheet.eventId,
                              ...payload,
                              created_at: editedTimestamp,
                            })
                          } else {
                            await handleLogEvent(payload)
                          }
                          closeSheet()
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
                    Nieuwe actie
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      className="input"
                      value={newCareLabel}
                      onChange={(event) => setNewCareLabel(event.target.value)}
                      placeholder="Bijv. oren schoonmaken"
                    />
                    <button className="btn btn-ghost" onClick={handleAddCare}>
                      Verzorgingsactie toevoegen
                    </button>
                  </div>
                </div>
                {sheet.error ? (
                  <p className="text-sm text-amber-700">{sheet.error}</p>
                ) : null}
                {isEdit ? (
                  <button
                    className="btn btn-primary w-full"
                    disabled={!sheet.data.care_action}
                    onClick={async () => {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        dog: sheet.dog,
                        type: 'verzorging',
                        data: { care_action: sheet.data.care_action },
                        created_at: editedTimestamp,
                      })
                      closeSheet()
                    }}
                  >
                    Wijzigingen opslaan
                  </button>
                ) : null}
              </div>
            ) : null}

            {sheet.type === 'welzijn' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Ernst</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {WELLBEING_LEVELS.map((item) => (
                      <button
                        key={item}
                        className={`chip ${
                          sheet.data.severity === item ? 'chip-active' : ''
                        }`}
                        onClick={() =>
                          setSheet((prev) => ({
                            ...prev,
                            data: { ...prev.data, severity: item },
                            error: '',
                          }))
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">Signalen</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {WELLBEING_TAGS.map((tag) => {
                      const active = (sheet.data.tags || []).includes(tag)
                      return (
                        <button
                          key={tag}
                          className={`chip ${active ? 'chip-active' : ''}`}
                          onClick={() =>
                            setSheet((prev) => ({
                              ...prev,
                              data: {
                                ...prev.data,
                                tags: active
                                  ? prev.data.tags.filter((value) => value !== tag)
                                  : [...(prev.data.tags || []), tag],
                                photos: active
                                  ? (prev.data.photos || []).filter(
                                      (photo) => photo.tag !== tag,
                                    )
                                  : prev.data.photos || [],
                              },
                              error: '',
                            }))
                          }
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {(sheet.data.tags || []).length > 0 ? (
                  <div className="space-y-3">
                    {sheet.data.tags.map((tag) => {
                      const taggedPhotos = (sheet.data.photos || []).filter(
                        (photo) => photo.tag === tag,
                      )
                      return (
                        <div key={tag}>
                          <p className="text-sm font-semibold text-amber-900">
                            Foto ({tag})
                          </p>
                          {taggedPhotos.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {taggedPhotos.map((photo) => (
                                <div key={photo.url} className="relative">
                                  <img
                                    src={photo.url}
                                    alt={`Foto ${tag}`}
                                    className="h-16 w-16 rounded-2xl object-cover"
                                    onClick={() => openPhotoPreview(photo.url)}
                                  />
                                  <button
                                    type="button"
                                    className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white text-xs font-semibold text-amber-900 shadow"
                                    onClick={() =>
                                      setSheet((prev) => ({
                                        ...prev,
                                        data: {
                                          ...prev.data,
                                          photos: prev.data.photos.filter(
                                            (item) => item.url !== photo.url,
                                          ),
                                        },
                                      }))
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <input
                            className="input mt-2"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={async (event) => {
                              const files = Array.from(event.target.files || [])
                              if (!files.length) return
                              setPhotoUploading(true)
                              const urls = await uploadPhotos(
                                files,
                                `welzijn/${tag}/${sheet.dog || 'onbekend'}`,
                              )
                              if (urls.length) {
                                setSheet((prev) => ({
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    photos: [
                                      ...(prev.data.photos || []),
                                      ...urls.map((url) => ({
                                        url,
                                        tag,
                                      })),
                                    ],
                                  },
                                }))
                              }
                              setPhotoUploading(false)
                              event.target.value = ''
                            }}
                            disabled={photoUploading || configMissing}
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                <div>
                  <p className="text-sm font-semibold text-amber-900">Notitie</p>
                  <textarea
                    className="input mt-2 min-h-[90px]"
                    value={sheet.data.note}
                    onChange={(event) =>
                      setSheet((prev) => ({
                        ...prev,
                        data: { ...prev.data, note: event.target.value },
                        error: '',
                      }))
                    }
                    placeholder="Bijv. wat loom, minder eetlust"
                  />
                </div>
                {sheet.error ? (
                  <p className="text-sm text-amber-700">{sheet.error}</p>
                ) : null}
                <button
                  className="btn btn-primary w-full"
                  disabled={saving || photoUploading}
                  onClick={async () => {
                    if (!sheet.data.note.trim()) {
                      setSheet((prev) => ({
                        ...prev,
                        error: 'Voeg een korte notitie toe.',
                      }))
                      return
                    }
                    const payload = {
                      dog: sheet.dog,
                      type: 'welzijn',
                      data: {
                        severity: sheet.data.severity,
                        note: sheet.data.note.trim(),
                        tags: sheet.data.tags || [],
                        photos: sheet.data.photos || [],
                      },
                    }
                    if (isEdit) {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        ...payload,
                        created_at: editedTimestamp,
                      })
                    } else {
                      await handleLogEvent(payload)
                    }
                    closeSheet()
                  }}
                >
                  {isEdit ? 'Wijzigingen opslaan' : 'Welzijn opslaan'}
                </button>
              </div>
            ) : null}

            {sheet.type === 'plas' ? (
              <div className="space-y-4">
                <p className="text-sm text-amber-800">
                  Geen extra details voor deze log.
                </p>
                <button
                  className="btn btn-primary w-full"
                  onClick={async () => {
                    const payload = {
                      dog: sheet.dog,
                      type: sheet.type,
                      data: {},
                    }
                    if (isEdit) {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        ...payload,
                        created_at: editedTimestamp,
                      })
                    } else {
                      await handleLogEvent(payload)
                    }
                    closeSheet()
                  }}
                >
                  {isEdit ? 'Wijzigingen opslaan' : 'Log opslaan'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 w-[92%] max-w-sm -translate-x-1/2 space-y-2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-2xl border px-4 py-3 text-sm shadow ${
              toast.tone === 'success'
                ? 'border-emerald-200/80 bg-white/95 text-emerald-900'
                : toast.tone === 'error'
                  ? 'border-rose-200/80 bg-white/95 text-rose-900'
                  : 'border-amber-200/80 bg-white/95 text-amber-900'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
