const POSITIONS_KEY_PREFIX = 'yield-sol:positions:'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function keyFor(scope) {
  return POSITIONS_KEY_PREFIX + scope
}

export function loadPositions(scope) {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(keyFor(scope))
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePositions(scope, positions) {
  if (!canUseStorage()) return
  window.localStorage.setItem(keyFor(scope), JSON.stringify(positions))
}
