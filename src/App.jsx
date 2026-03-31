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

const POOP_CONSISTENCY = ['goed', 'zacht', 'diarree', 'anders']
const POOP_SIZE = ['klein', 'medium', 'groot']
const MEAL_TYPES = ['brokken', 'rauwvoer', 'prutje']
const PRUTJE_ADDITIVES = ['probiotica', 'sardineolie', 'psylliumvezels']
const WELLBEING_LEVELS = ['laag', 'middel', 'hoog']

const DEFAULT_CARE_ACTIONS = ['borstelen', 'blazen', 'nagels knippen']
const DEFAULT_TRAINING_TYPES = ['Algemeen']

const toDateKey = (value) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatTime = (value) =>
  new Date(value).toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  })

const formatLongDate = (value) =>
  new Date(value).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

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
        data: { consistency: '', size: '' },
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
        data: { severity: 'middel', note: '' },
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
        data: {
          consistency: data.consistency || '',
          size: data.size || '',
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
        data: {
          severity: data.severity || 'middel',
          note: data.note || '',
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
      data,
      error: '',
    })
  }

  const closeSheet = () => {
    setSheet(emptySheetState)
  }

  const handleLogEvent = async ({ dog, type, data }) => {
    if (!supabase) {
      setError('Supabase ontbreekt. Voeg je keys toe in .env.local.')
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
    }

    setSaving(false)
  }

  const handleUpdateEvent = async ({ id, dog, type, data }) => {
    if (!supabase) {
      setError('Supabase ontbreekt. Voeg je keys toe in .env.local.')
      return
    }
    if (saving) return
    setSaving(true)
    setError('')

    const { data: updated, error: updateError } = await supabase
      .from('events')
      .update({ dog, type, data })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      setError('Bijwerken mislukte. Probeer het opnieuw.')
    } else if (updated) {
      upsertEvent(updated)
    }

    setSaving(false)
  }

  const handleDeleteEvent = async (eventId) => {
    if (!supabase) {
      setError('Supabase ontbreekt. Voeg je keys toe in .env.local.')
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
    }

    setSaving(false)
  }

  const logQuick = async (dog, type) => {
    await handleLogEvent({ dog, type, data: {} })
  }

  const handleAddTraining = async () => {
    if (!supabase) {
      setSheet((prev) => ({ ...prev, error: 'Supabase ontbreekt.' }))
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
  }

  const handleAddCare = async () => {
    if (!supabase) {
      setSheet((prev) => ({ ...prev, error: 'Supabase ontbreekt.' }))
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
          <div className="app-card flex flex-col gap-2 px-4 py-3 text-xs md:px-5 md:py-4 md:text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              ></span>
              <span className="font-semibold text-amber-900">
                {isSupabaseConfigured ? 'Realtime actief' : 'Realtime uit'}
              </span>
            </div>
            <p className="text-xs text-amber-700">
              {isSupabaseConfigured
                ? 'Iedere log komt direct bij de ander binnen.'
                : 'Voeg Supabase keys toe om te delen.'}
            </p>
          </div>
        </header>

        {error ? (
          <div className="app-card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        {!isSupabaseConfigured ? (
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
                      >
                        Poep
                      </button>
                      <button
                        className="btn btn-muted px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => logQuick(dog, 'plas')}
                        disabled={saving}
                      >
                        Plas
                      </button>
                      <button
                        className="btn btn-muted px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => logQuick(dog, 'wandeling')}
                        disabled={saving}
                      >
                        Wandeling
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'maaltijd')}
                      >
                        Maaltijd
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'training')}
                      >
                        Training
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'verzorging')}
                      >
                        Verzorging
                      </button>
                      <button
                        className="btn btn-ghost px-3 py-2 text-xs md:px-4 md:py-3 md:text-sm"
                        onClick={() => openSheet(dog, 'welzijn')}
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
                mobileTab === 'daglijn' ? '' : 'hidden md:block'
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
              className={`app-card space-y-4 p-5 ${
                mobileTab === 'daglijn' ? '' : 'hidden md:block'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">Daglijn</h2>
                  <p className="mt-1 text-sm text-amber-800">{activeSummaryDate}</p>
                </div>
                <span className="chip">
                  {filteredEvents.length} meldingen
                </span>
              </div>
              {loading ? (
                <p className="text-sm text-amber-700">Bezig met laden...</p>
              ) : filteredEvents.length === 0 ? (
                <p className="text-sm text-amber-700">
                  Geen logs op deze dag. Tijd voor een wandeling?
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-3xl border border-amber-200/70 bg-white/80 p-4"
                    >
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-600">
                        <span>{event.dog}</span>
                        <span>{formatTime(event.created_at)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="chip">
                          {EVENT_TYPE_LABELS[event.type] || event.type}
                        </span>
                        <span className="text-sm text-amber-900">
                          {formatEventDetails(event)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="btn btn-ghost px-3 py-2 text-xs"
                          onClick={() => openEditSheet(event)}
                        >
                          Bewerken
                        </button>
                        <button
                          className="btn btn-ghost px-3 py-2 text-xs"
                          onClick={() => handleDeleteEvent(event.id)}
                          disabled={saving}
                        >
                          Verwijderen
                        </button>
                      </div>
                    </div>
                  ))}
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
              mobileTab === 'daglijn' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setMobileTab('daglijn')}
          >
            Daglijn
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
              <button className="btn btn-ghost" onClick={closeSheet}>
                Sluiten
              </button>
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
                {sheet.error ? (
                  <p className="text-sm text-amber-700">{sheet.error}</p>
                ) : null}
                <button
                  className="btn btn-primary w-full"
                  disabled={!sheet.data.consistency || !sheet.data.size || saving}
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
                      },
                    }
                    if (isEdit) {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        ...payload,
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
                      },
                    }
                    if (isEdit) {
                      await handleUpdateEvent({
                        id: sheet.eventId,
                        ...payload,
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
    </div>
  )
}

export default App
