export interface Storage {
  get: () => unknown
  set: (token: string) => void
  remove: () => void
}
export function createSession(storage: Storage) {
  let token = ''
  let revision = 0
  const listeners = new Set<() => void>()
  return {
    restore() {
      const value = storage.get()
      token = typeof value === 'string' ? value : ''
      revision++
    },
    snapshot() {
      return {
        token,
        revision,
      }
    },
    save(value: string) {
      storage.set(value)
      token = value
      revision++
      listeners.forEach(fn => fn())
    },
    clear() {
      storage.remove()
      token = ''
      revision++
      listeners.forEach(fn => fn())
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}
export type Session = ReturnType<typeof createSession>
