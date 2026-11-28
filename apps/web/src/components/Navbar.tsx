import { BookOpen, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Navbar() {
  const [open, setOpen] = useState(false)
  const { isAuthenticated, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'

  const closeMenu = () => setOpen(false)
  const showHowItWorks = () => {
    closeMenu()
    if (!isHome) {
      navigate('/#how-it-works')
      return
    }
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-[#151719]/95 px-4 backdrop-blur-sm sm:px-6">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between" aria-label="Main navigation">
        <Link to="/" onClick={closeMenu} className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8c89b]/10 text-[#e8c89b]"><BookOpen className="h-4 w-4" /></span>
          MemoRoute
        </Link>
        <div className="hidden items-center gap-6 sm:flex">
          {!isAuthenticated && <button type="button" onClick={showHowItWorks} className="text-sm text-white/65 transition hover:text-white">How it works</button>}
          {isAuthenticated ? (
            <>
              <Link to="/student" className="text-sm text-white/65 transition hover:text-white">Home</Link>
              <Link to="/revisions" className="text-sm text-white/65 transition hover:text-white">Revisions</Link>
              <Link to="/topics/new" className="text-sm text-white/65 transition hover:text-white">Add topic</Link>
              <button type="button" onClick={() => void logout()} className="text-sm text-white/50 transition hover:text-white">Sign out</button>
            </>
          ) : (
            <Link to="/login" className="rounded-lg bg-[#e8c89b] px-4 py-2 text-sm font-semibold text-[#211b18] transition hover:bg-[#f0d8b6]">Get started</Link>
          )}
        </div>
        <button type="button" className="rounded-md p-2 text-white/75 hover:bg-white/5 sm:hidden" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div className="mx-auto max-w-6xl border-t border-white/10 py-3 sm:hidden">
          {isAuthenticated ? (
            <div className="flex flex-col">
              <Link to="/student" onClick={closeMenu} className="rounded-md px-3 py-3 text-sm text-white/75 hover:bg-white/5">Home</Link>
              <Link to="/revisions" onClick={closeMenu} className="rounded-md px-3 py-3 text-sm text-white/75 hover:bg-white/5">Revisions</Link>
              <Link to="/topics/new" onClick={closeMenu} className="rounded-md px-3 py-3 text-sm text-white/75 hover:bg-white/5">Add topic</Link>
              <button type="button" onClick={() => { closeMenu(); void logout() }} className="rounded-md px-3 py-3 text-left text-sm text-white/50 hover:bg-white/5">Sign out</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={showHowItWorks} className="rounded-md px-3 py-3 text-left text-sm text-white/75 hover:bg-white/5">How it works</button>
              <Link to="/login" onClick={closeMenu} className="rounded-md px-3 py-3 text-sm font-semibold text-[#e8c89b] hover:bg-white/5">Get started</Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
