export type Rater = 'Brad' | 'Kyle'

export type Rating = {
  rater: Rater
  locationName: string
  rating: number
  notes?: string
  lat?: number
  lng?: number
  googleMapsUrl?: string
  address?: string
  city?: string
  state?: string
  dateVisited?: string
  hasCoords: boolean
}

export type Meta = {
  lastSyncedAt: string | null
  sourceSheetId: string
  rowCount: number
  missingCoordsCount: number
}
