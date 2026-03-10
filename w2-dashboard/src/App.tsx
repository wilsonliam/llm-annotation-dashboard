import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ParetoPage } from './pages/ParetoPage'
import { DetailsPage } from './pages/DetailsPage'
import { VisitExplorerPage } from './pages/VisitExplorerPage'
import { ConformalPage } from './pages/ConformalPage'
import { SemanticPage } from './pages/SemanticPage'
import { DashboardProvider } from './hooks/DashboardContext'

export default function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ParetoPage />} />
            <Route path="details" element={<DetailsPage />} />
            <Route path="visits" element={<VisitExplorerPage />} />
            <Route path="conformal" element={<ConformalPage />} />
            <Route path="semantic" element={<SemanticPage />} />
          </Route>
        </Routes>
      </DashboardProvider>
    </BrowserRouter>
  )
}
