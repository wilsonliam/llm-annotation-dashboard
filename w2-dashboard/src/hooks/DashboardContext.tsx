import { createContext, useContext, useState, useEffect } from 'react'
import { loadDashboardData } from '../lib/loader'
import type { DashboardData } from '../lib/loader'

interface DashboardContextValue {
  data: DashboardData | null
  loading: boolean
  error: string | null
}

const DashboardContext = createContext<DashboardContextValue>({
  data: null,
  loading: true,
  error: null,
})

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <DashboardContext.Provider value={{ data, loading, error }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  return useContext(DashboardContext)
}
