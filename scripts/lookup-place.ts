import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import * as path from 'path'

dotenv.config()

// Resolve secrets path relative to this file, not process CWD
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KEY_FILE = path.resolve(__dirname, '../secrets/service-account.json')

const SHEET_ID = process.env.SHEET_ID
const SHEET_TAB = process.env.SHEET_TAB ?? 'Sheet1'
const DRY_RUN = process.argv.includes('--dry-run')

function validateEnv() {
  const missing = ['SHEET_ID'].filter(k => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    console.error('Create a .env file from .env.example and fill in the values.')
    process.exit(1)
  }
}

// Flexible column name matching — handles snake_case, camelCase, spaces, any casing
function findCol(headers: string[], ...candidates: string[]): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[_\s]/g, '')
  for (const c of candidates) {
    const idx = headers.findIndex(h => normalize(h) === normalize(c))
    if (idx !== -1) return idx
  }
  return -1
}

async function followRedirect(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} following redirect for ${url}`)
  return res.url
}

function extractFromMapsUrl(url: string): { name: string; lat: number; lng: number } | null {
  const nameMatch = url.match(/\/place\/([^/@]+)/)
  const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : ''

  // Primary: !3d and !4d hold the precise place coordinates
  const latMatch = url.match(/!3d(-?\d+\.\d+)/)
  const lngMatch = url.match(/!4d(-?\d+\.\d+)/)
  if (latMatch && lngMatch) {
    return { name, lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) }
  }

  // Fallback: @lat,lng,zoom format (map view center — less precise but better than nothing)
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) {
    return { name, lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }
  }

  return null
}

async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; city: string; state: string }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { 'User-Agent': 'OF-Ratings-lookup/1.0' } }
  )
  if (res.status === 429) throw new Error('Nominatim rate limit hit — wait a minute and retry')
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)

  const data = await res.json() as { address?: Record<string, string> }
  if (!data.address) throw new Error('Nominatim returned no address data')

  const a = data.address
  const city = a.city ?? a.town ?? a.village ?? ''
  const state = a.state ?? ''
  const parts = [
    a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
    city,
    state,
    a.postcode,
  ].filter(Boolean)
  return { address: parts.join(', '), city, state }
}

function colLetter(idx: number): string {
  let letter = ''
  let n = idx + 1
  while (n > 0) {
    letter = String.fromCharCode(((n - 1) % 26) + 65) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

async function main() {
  validateEnv()

  if (DRY_RUN) console.log('--- DRY RUN — no changes will be written ---\n')

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  // Read headers from row 1 explicitly so empty columns aren't silently trimmed
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!1:1`,
  })
  const headers = (headerRes.data.values?.[0] ?? []).map((h: string) => h.toLowerCase().trim())

  // Read data rows — A2:ZZ covers up to 702 columns
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A2:ZZ`,
  })
  const rows = dataRes.data.values ?? []
  if (rows.length === 0) {
    console.error('Sheet has no data rows.')
    process.exit(1)
  }

  const colUrl   = findCol(headers, 'google_maps_url', 'googleMapsUrl', 'maps_url', 'mapsUrl', 'url')
  const colName  = findCol(headers, 'location_name', 'locationName', 'name', 'place')
  const colLat   = findCol(headers, 'lat', 'latitude')
  const colLng   = findCol(headers, 'lng', 'lon', 'longitude')
  const colAddr  = findCol(headers, 'address', 'addr')
  const colCity  = findCol(headers, 'city')
  const colState = findCol(headers, 'state')

  console.log('Columns found:')
  console.log(`  google_maps_url → ${colUrl === -1 ? 'NOT FOUND' : headers[colUrl]}  (col ${colLetter(colUrl)})`)
  console.log(`  location_name   → ${colName === -1 ? 'NOT FOUND' : headers[colName]}  (col ${colLetter(colName)})`)
  console.log(`  lat             → ${colLat === -1 ? 'NOT FOUND' : headers[colLat]}  (col ${colLetter(colLat)})`)
  console.log(`  lng             → ${colLng === -1 ? 'NOT FOUND' : headers[colLng]}  (col ${colLetter(colLng)})`)
  console.log(`  address         → ${colAddr === -1 ? 'NOT FOUND' : headers[colAddr]}  (col ${colLetter(colAddr)})`)
  console.log(`  city            → ${colCity === -1 ? 'NOT FOUND' : headers[colCity]}  (col ${colLetter(colCity)})`)
  console.log(`  state           → ${colState === -1 ? 'NOT FOUND' : headers[colState]}  (col ${colLetter(colState)})`)
  console.log()

  if (colUrl === -1) {
    console.error('Could not find a google_maps_url column. Check your header names.')
    process.exit(1)
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const shortUrl = row[colUrl]?.trim()
    if (!shortUrl) continue

    const rowNum = i + 2 // +2 because data starts at sheet row 2
    process.stdout.write(`Row ${rowNum}: ${shortUrl} ... `)

    let fullUrl: string
    try {
      fullUrl = await followRedirect(shortUrl)
    } catch (err: unknown) {
      console.log(`FAILED (redirect) — ${err instanceof Error ? err.message : err}`)
      continue
    }

    const extracted = extractFromMapsUrl(fullUrl)
    if (!extracted) {
      // Log a snippet of the URL to help extend parsers with evidence
      console.log(`FAILED (parse) — could not extract coords from: ${fullUrl.slice(0, 120)}`)
      continue
    }

    await new Promise(r => setTimeout(r, 1100)) // Nominatim rate limit

    let geo: { address: string; city: string; state: string }
    try {
      geo = await reverseGeocode(extracted.lat, extracted.lng)
    } catch (err: unknown) {
      console.log(`FAILED (geocode) — ${err instanceof Error ? err.message : err}`)
      continue
    }

    const rowUpdates: { range: string; values: unknown[][] }[] = []
    if (colName !== -1)  rowUpdates.push({ range: `${SHEET_TAB}!${colLetter(colName)}${rowNum}`,  values: [[extracted.name]] })
    if (colLat !== -1)   rowUpdates.push({ range: `${SHEET_TAB}!${colLetter(colLat)}${rowNum}`,   values: [[extracted.lat]] })
    if (colLng !== -1)   rowUpdates.push({ range: `${SHEET_TAB}!${colLetter(colLng)}${rowNum}`,   values: [[extracted.lng]] })
    if (colAddr !== -1)  rowUpdates.push({ range: `${SHEET_TAB}!${colLetter(colAddr)}${rowNum}`,  values: [[geo.address]] })
    if (colCity !== -1)  rowUpdates.push({ range: `${SHEET_TAB}!${colLetter(colCity)}${rowNum}`,  values: [[geo.city]] })
    if (colState !== -1) rowUpdates.push({ range: `${SHEET_TAB}!${colLetter(colState)}${rowNum}`, values: [[geo.state]] })

    if (DRY_RUN) {
      console.log(`would write — ${extracted.name} (${extracted.lat}, ${extracted.lng}) | ${geo.city}, ${geo.state}`)
      continue
    }

    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: rowUpdates },
      })
      console.log(`done — ${extracted.name}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`WRITE FAILED — ${msg}`)
    }
  }

  console.log('\nAll done.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
