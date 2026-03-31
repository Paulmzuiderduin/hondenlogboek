# Apple Shortcuts – One‑tap logging

Deze flow maakt een **true one‑tap** log via een Supabase Edge Function.
De iPhone hoeft de webapp niet te openen.

## 1) Secrets in Supabase

Open je Supabase project → **Project Settings → Functions → Secrets**.

Voeg toe:

- `SHORTCUTS_TOKEN` = een lange random token (min. 32 tekens)
- `SUPABASE_SERVICE_ROLE_KEY` = je service role key (Project Settings → API)

> De service role key blijft alleen server‑side in de Edge Function.

## 2) Edge Function deployen

Gebruik de Supabase CLI:

```
supabase login
supabase link --project-ref upnkcvswyiprbppiegtv
supabase secrets set SHORTCUTS_TOKEN=JOUW_TOKEN
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=JOUW_SERVICE_ROLE_KEY
supabase functions deploy log-event
```

Function endpoint:

```
https://upnkcvswyiprbppiegtv.functions.supabase.co/log-event
```

## 3) Shortcut aanmaken (iOS)

Open **Shortcuts** → **Nieuwe Shortcut**:

1. Actie: **Get Contents of URL**
2. URL:
   ```
   https://upnkcvswyiprbppiegtv.functions.supabase.co/log-event
   ```
3. Method: **POST**
4. Headers:
   - `Content-Type` = `application/json`
   - `x-shortcuts-token` = jouw token
5. Request Body (JSON):

### Voorbeeld – Poep (Babs)

```json
{
  "dog": "Babs",
  "type": "poep",
  "data": {
    "consistency": "goed",
    "size": "medium"
  }
}
```

### Voorbeeld – Maaltijd (Moos)

```json
{
  "dog": "Moos",
  "type": "maaltijd",
  "data": {
    "meal_type": "prutje",
    "additives": ["probiotica", "psylliumvezels"]
  }
}
```

### Voorbeeld – Welzijn (Babs)

```json
{
  "dog": "Babs",
  "type": "welzijn",
  "data": {
    "severity": "middel",
    "note": "Lusteloos na wandeling",
    "tags": ["lusteloos"]
  }
}
```

## 4) Optioneel: tijd meegeven

Je kunt een eigen timestamp meegeven:

```json
{
  "dog": "Babs",
  "type": "plas",
  "created_at": "2026-03-31T08:15:00.000Z"
}
```

Als `created_at` ontbreekt, gebruikt de functie automatisch `now()`.
