import { useState, useEffect, useCallback } from 'react'
import { fetchYields } from '../lib/yields'

const REFRESH_INTERVAL = 60_000 // 1 minute

export function useYields() {
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchYields()
      setMarkets(data)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [load])

  return { markets, loading, error, lastUpdated, refresh: load }
}
