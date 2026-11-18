import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AuthProvider } from './context/AuthContext'
import { NotesProvider } from './context/NotesContext'
import { SubscriptionProvider } from './context/SubscriptionContext'
import { ThemeProvider } from './context/ThemeContext'
import { PageLoader } from './components/ui/page-loader'
import { Home } from './pages/Home'
import { Login } from './pages/Login'

const StudentDashboard = lazy(() =>
  import('./pages/StudentFlow').then((m) => ({ default: m.StudentDashboard })),
)
const RevisionSubjectsPage = lazy(() =>
  import('./pages/StudentFlow').then((m) => ({ default: m.RevisionSubjectsPage })),
)
const NewTopicPage = lazy(() =>
  import('./pages/StudentFlow').then((m) => ({ default: m.NewTopicPage })),
)
const PracticeQuestionPage = lazy(() =>
  import('./pages/StudentFlow').then((m) => ({ default: m.PracticeQuestionPage })),
)

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="theme-page min-h-screen">
          <PageLoader />
        </div>
      }
    >
      <div className="page-enter">{children}</div>
    </Suspense>
  )
}

function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return <div className="theme-page min-h-screen"><PageLoader /></div>
  }
  return isAuthenticated ? <Navigate to="/student" replace /> : <Home />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<Login />} />
      <Route path="/student" element={<LazyPage><StudentDashboard /></LazyPage>} />
      <Route path="/revisions" element={<LazyPage><RevisionSubjectsPage /></LazyPage>} />
      <Route path="/topics/new" element={<LazyPage><NewTopicPage /></LazyPage>} />
      <Route path="/practice/:noteId" element={<LazyPage><PracticeQuestionPage /></LazyPage>} />
      <Route path="/dashboard" element={<Navigate to="/student" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <NotesProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </NotesProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
