import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const DOGS = ['Babs', 'Moos']
const EVENT_TYPES = [
  { key: 'poep', label: 'Poep' },
  { key: 'plas', label: 'Plas' },
  { key: 'wandeling', label: 'Wandeling' },
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
  poep: 'bg-amber-600',
  plas: 'bg-sky-500',
  wandeling: 'bg-emerald-500',
  maaltijd: 'bg-orange-500',
  training: 'bg-indigo-500',
  verzorging: 'bg-rose-500',
  welzijn: 'bg-purple-500',
}

const POOP_CONSISTENCY = ['goed', 'zacht', 'diarree', 'anders']
const POOP_SIZE = ['klein', 'medium', 'groot']
const MEAL_TYPES = ['brokken', 'rauwvoer', 'prutje']
const PRUTJE_ADDITIVES = ['probiotica', 'sardineolie', 'psylliumvezels']
const WELLBEING_LEVELS = ['laag', 'middel', 'hoog']
const WELLBEING_TAGS = ['niet eten', 'kotsen', 'lusteloos']
const PHOTO_BUCKET = 'hondenlogboek-photos'

const DEFAULT_CARE_ACTIONS = ['borstelen', 'blazen', 'nagels knippen']
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
    case 'wandeling':
      return 'Wandeling'
    case 'maaltijd':
      if (data.meal_type === 'prutje') {
        const additives = (data.additives || []).join(', ')
        return `Prutje${additives ? ` (${additives})` : ''}`
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
  const [newTrainingLabel, setNewTrainingLabel] = useState('')
  const [newCareLabel, setNewCareLabel] = useState('')
  const [toasts, setToasts] = useState([])
  const [photoUploading, setPhotoUploading] = useState(false)
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
      startDate.setDate(startDate.getDate() - 13)

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

  const weeklySummary = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 6)

    return DOGS.map((dog) => {
      const counts = EVENT_TYPES.reduce((acc, type) => {
        acc[type.key] = 0
        return acc
      }, {})

      events
        .filter((event) => event.dog === dog)
        .filter((event) => new Date(event.created_at) >= start)
        .forEach((event) => {
          counts[event.type] = (counts[event.type] || 0) + 1
        })

      return { dog, counts }
    })
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
        data: { meal_type: 'brokken', additives: [] },
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
      const mealType = data.meal_type || 'brokken'
      const additives = Array.isArray(data.additives)
        ? data.additives
        : mealType === 'prutje'
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
          meal_type: mealType,
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
  const nowHour = isToday ? new Date().getHours() : null
  const visibleHours = useMemo(() => {
    const hours = new Set()
    timelineEvents.forEach((event) => {
      hours.add(new Date(event.created_at).getHours())
    })
    if (isToday && nowHour !== null) {
      hours.add(nowHour)
    }
    return Array.from(hours).sort((a, b) => a - b)
  }, [timelineEvents, isToday, nowHour])
  const timelineRangeLabel =
    visibleHours.length >= 24 ? '24 uur' : 'Uren met logs'

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
          {null}
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
                mobileTab === 'loggen' ? '' : 'hidden md:block'
              }`}
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
                        className="btn btn-muted px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => logQuick(dog, 'wandeling')}
                        disabled={saving || configMissing}
                      >
                        Wandeling
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
                mobileTab === 'tijdlijn' ? '' : 'hidden md:block'
              }`}
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
                mobileTab === 'tijdlijn' ? '' : 'hidden md:block'
              }`}
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
                  Geen logs op deze dag. Tijd voor een wandeling?
                </p>
              ) : (
                <div className="mt-4 rounded-3xl border border-amber-200/70 bg-white/80 p-2 sm:p-3 md:p-4">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-amber-600 sm:text-xs sm:tracking-[0.25em]">
                    <span>{timelineRangeLabel}</span>
                    <span>Tik om te bewerken</span>
                  </div>
                  <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
                    <div className="grid grid-cols-[44px_1fr] gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-600 sm:grid-cols-[52px_1fr] sm:gap-3 sm:text-xs sm:tracking-[0.25em] md:grid-cols-[72px_1fr] md:gap-4">
                      <span></span>
                      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                        <span>Babs</span>
                        <span>Moos</span>
                      </div>
                    </div>
                    {visibleHours.map((hour) => {
                      const isNow = nowHour === hour
                      return (
                        <div
                          key={`hour-row-${hour}`}
                          className={`grid min-w-0 grid-cols-[44px_1fr] gap-2 rounded-2xl px-2 py-2 sm:grid-cols-[52px_1fr] sm:gap-3 sm:py-2.5 md:grid-cols-[72px_1fr] md:gap-4 md:py-3 ${
                            isNow ? 'bg-amber-100/70' : ''
                          }`}
                        >
                          <div className="text-[11px] font-semibold leading-tight text-amber-700 sm:text-xs">
                            {String(hour).padStart(2, '0')}:00
                            {isNow ? (
                              <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white sm:text-[10px]">
                                Nu
                              </span>
                            ) : null}
                          </div>
                          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                            {DOGS.map((dog) => {
                              const events = timelineEvents
                                .filter((event) => event.dog === dog)
                                .filter(
                                  (event) =>
                                    new Date(event.created_at).getHours() === hour,
                                )
                              return (
                                <div
                                  key={`${dog}-${hour}`}
                                  className="relative min-w-0 rounded-2xl border border-amber-100 bg-amber-50/60 px-2 py-1.5 sm:px-3 sm:py-2"
                                >
                                  <div className="absolute left-1.5 top-1.5 bottom-1.5 w-0.5 rounded-full bg-amber-200 sm:left-2 sm:top-2 sm:bottom-2 sm:w-1"></div>
                                  <div className="space-y-1.5 pl-4 sm:space-y-2 sm:pl-5">
                                    <p className="text-[9px] uppercase tracking-[0.2em] text-amber-500 md:hidden">
                                      {dog}
                                    </p>
                                    {events.length === 0 ? (
                                      <div className="h-3 rounded-full border border-dashed border-amber-200/60 bg-white/70"></div>
                                    ) : (
                                      events.map((event) => {
                                        const typeLabel =
                                          EVENT_TYPE_LABELS[event.type] ||
                                          event.type
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
                                            className="w-full min-w-0 rounded-2xl border border-amber-200/70 bg-white/95 px-2 py-1.5 text-left shadow-sm sm:px-3 sm:py-2"
                                          >
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-600 sm:text-xs sm:tracking-[0.2em]">
                                              <span>{formatTimeInput(event.created_at)}</span>
                                              <span
                                                className={`h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3 ${color}`}
                                              ></span>
                                              <span className="chip px-2 py-1 text-[9px] sm:text-[10px]">
                                                {typeLabel}
                                              </span>
                                            </div>
                                            {showDetails ? (
                                              <p className="mt-1.5 text-[11px] leading-snug text-amber-900 sm:mt-2 sm:text-sm">
                                                {details}
                                              </p>
                                            ) : null}
                                            {photos.length > 0 ? (
                                              <div className="mt-1.5 flex flex-wrap gap-2 sm:mt-2">
                                                {photos.map((photo) => (
                                                  <img
                                                    key={photo.url}
                                                    src={photo.url}
                                                    alt="Log foto"
                                                    className="h-8 w-8 rounded-2xl object-cover sm:h-10 sm:w-10"
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
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div
              className={`app-card space-y-4 p-5 ${
                mobileTab === 'week' ? '' : 'hidden md:block'
              }`}
            >
              <div>
                <h2 className="text-2xl font-semibold">Weekoverzicht</h2>
                <p className="mt-1 text-sm text-amber-800">
                  Laatste 7 dagen inclusief vandaag.
                </p>
              </div>
              <div className="space-y-3">
                {weeklySummary.map((summary) => (
                  <div
                    key={summary.dog}
                    className="rounded-3xl border border-amber-200/70 bg-white/80 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{summary.dog}</h3>
                      <span className="chip">7 dagen</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {EVENT_TYPES.map((type) => (
                        <div
                          key={type.key}
                          className="flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-2"
                        >
                          <span>{type.label}</span>
                          <span className="font-semibold text-amber-900">
                            {summary.counts[type.key] || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                  {(sheet.type === 'plas' || sheet.type === 'wandeling') &&
                    (isEdit ? 'Log wijzigen' : 'Log toevoegen')}
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
                  <p className="text-sm font-semibold text-amber-900">Type maaltijd</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MEAL_TYPES.map((item) => (
                      <button
                        key={item}
                        className={`chip ${
                          sheet.data.meal_type === item ? 'chip-active' : ''
                        }`}
                        onClick={() =>
                          setSheet((prev) => ({
                            ...prev,
                            data: {
                              ...prev.data,
                              meal_type: item,
                              additives:
                                item === 'prutje'
                                  ? prev.data.additives.length
                                    ? prev.data.additives
                                    : PRUTJE_ADDITIVES
                                  : [],
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
                {sheet.data.meal_type === 'prutje' ? (
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
                        meal_type: sheet.data.meal_type,
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

            {sheet.type === 'plas' || sheet.type === 'wandeling' ? (
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
