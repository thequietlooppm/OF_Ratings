import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { Rating, Rater, Meta } from '../src/types/rating.ts'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KEY_FILE = path.resolve(__dirname, '../secrets/service-account.json')
const DATA_DIR = path.resolve(__dirname, '../src/data')

const SHEET_ID = process.env.SHEET_ID
const SHEET_TAB = process.env.SHEET_TAB ?? 'Sheet1'
const VALID_RATERS: Rater[] = ['Brad', 'Kyle']

function validateEnv() {
  const missing = ['SHEET_ID'].filter(k => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    console.error('Create a .env file from .env.example and fill in the values.')
    process.exit(1)
  }
}

function findCol(headers: string[], ...candidates: string[]): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[_\s]/g, '')
  for (const c of candidates) {
    const idx = headers.findIndex(h => normalize(h) === normalize(c))
    if (idx !== -1) return idx
  }
  return -1
}

function parseNum(val: string | undefined): number | undefined {
  if (!val?.trim()) return undefined
  const n = parseFloat(val)
  return isNaN(n) ? undefined : n
}

async function main() {
  validateEnv()

  // Support credentials from env var (CI) or key file (local)
  const authOptions = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }
    : { keyFile: KEY_FILE, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }

  const auth = new google.auth.GoogleAuth(authOptions)
  const sheets = google.sheets({ version: 'v4', auth })

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!1:1`,
  })
  const headers = (headerRes.data.values?.[0] ?? []).map((h: string) => h.toLowerCase().trim())

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A2:ZZ`,
  })
  const rows = dataRes.data.values ?? []

  const col = {
    rater:      findCol(headers, 'rater'),
    name:       findCol(headers, 'location_name', 'locationName', 'name'),
    rating:     findCol(headers, 'rating'),
    notes:      findCol(headers, 'notes'),
    lat:        findCol(headers, 'lat', 'latitude'),
    lng:        findCol(headers, 'lng', 'lon', 'longitude'),
    mapsUrl:    findCol(headers, 'google_maps_url', 'googleMapsUrl'),
    address:    findCol(headers, 'address'),
    city:       findCol(headers, 'city'),
    state:      findCol(headers, 'state'),
    dateVisited: findCol(headers, 'date_visited', 'dateVisited'),
  }

  const required = { rater: col.rater, locationName: col.name, rating: col.rating }
  const missing = Object.entries(required).filter(([, v]) => v === -1).map(([k]) => k)
  if (missing.length > 0) {
    console.error(`Required columns not found: ${missing.join(', ')}`)
    process.exit(1)
  }

  const ratings: Rating[] = []
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const get = (c: number) => (c !== -1 ? row[c]?.trim() : undefined) ?? undefined

    const raterRaw = get(col.rater)
    const locationName = get(col.name)
    const ratingRaw = get(col.rating)

    if (!raterRaw && !locationName && !ratingRaw) continue // blank row

    if (!VALID_RATERS.includes(raterRaw as Rater)) {
      console.warn(`  Row ${i + 2}: skipped — invalid rater "${raterRaw}"`)
      skipped++
      continue
    }
    if (!locationName) {
      console.warn(`  Row ${i + 2}: skipped — missing location name`)
      skipped++
      continue
    }
    const rating = parseNum(ratingRaw)
    if (rating === undefined) {
      console.warn(`  Row ${i + 2}: skipped — missing or invalid rating`)
      skipped++
      continue
    }

    const lat = parseNum(get(col.lat))
    const lng = parseNum(get(col.lng))

    ratings.push({
      rater: raterRaw as Rater,
      locationName,
      rating,
      ...(get(col.notes)       && { notes: get(col.notes) }),
      ...(lat !== undefined    && { lat }),
      ...(lng !== undefined    && { lng }),
      ...(get(col.mapsUrl)     && { googleMapsUrl: get(col.mapsUrl) }),
      ...(get(col.address)     && { address: get(col.address) }),
      ...(get(col.city)        && { city: get(col.city) }),
      ...(get(col.state)       && { state: get(col.state) }),
      ...(get(col.dateVisited) && { dateVisited: get(col.dateVisited) }),
      hasCoords: lat !== undefined && lng !== undefined,
    })
  }

  ratings.sort((a, b) =>
    a.rater.localeCompare(b.rater) || a.locationName.localeCompare(b.locationName)
  )

  const missingCoordsCount = ratings.filter(r => !r.hasCoords).length
  const meta: Meta = {
    lastSyncedAt: new Date().toISOString(),
    sourceSheetId: SHEET_ID!,
    rowCount: ratings.length,
    missingCoordsCount,
  }

  fs.writeFileSync(path.join(DATA_DIR, 'ratings.json'), JSON.stringify(ratings, null, 2))
  fs.writeFileSync(path.join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2))

  console.log(`Synced ${ratings.length} ratings (${skipped} skipped)`)
  if (missingCoordsCount > 0) {
    console.log(`  ⚠ ${missingCoordsCount} rows missing lat/lng — won't appear on map`)
  }
  console.log(`  Written to src/data/`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
