import { ArrowRight, BookOpenCheck, Brain, CalendarClock, Mic2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'

const steps = [
  {
    icon: BookOpenCheck,
    title: 'Add a topic',
    description: 'Save what you are learning and attach notes when you need them.',
  },
  {
    icon: Brain,
    title: 'Recall it simply',
    description: 'Explain the idea from memory in your own words, by typing or speaking.',
  },
  {
    icon: CalendarClock,
    title: 'Review at the right time',
    description: 'Build a steady revision habit with topics brought back when they are due.',
  },
]

export function Home() {
  return (
    <div className="theme-page min-h-screen">
      <Navbar />
      <main id="home">
        <section className="mx-auto grid min-h-[76vh] max-w-6xl items-center gap-12 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-32">
          <div>
            <p className="mb-4 text-sm font-semibold text-[#e8c89b]">A calmer way to learn</p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Remember what you learn by explaining it.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
              MemoRoute turns your study notes into short recall practice and a simple revision routine.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-lg bg-[#e8c89b] px-5 py-3 text-sm font-semibold text-[#211b18] transition hover:bg-[#f0d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className="rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]">
                See how it works
              </a>
            </div>
            <p className="mt-5 text-xs text-white/45">Practice by typing or voice. Start with one topic.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
            <div className="flex items-center gap-3 border-b border-white/10 pb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8c89b]/10 text-[#e8c89b]"><Mic2 className="h-5 w-5" /></span>
              <div><p className="text-sm font-semibold text-white">A short recall session</p><p className="mt-1 text-xs text-white/45">Biology · Photosynthesis</p></div>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/45">Your prompt</p>
            <p className="mt-2 text-lg leading-7 text-white">Explain how a plant turns light into stored energy.</p>
            <div className="mt-6 rounded-xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs text-white/45">Try to recall the main idea before looking at your notes.</p>
              <div className="mt-4 h-2 rounded-full bg-white/10"><div className="h-2 w-2/3 rounded-full bg-[#e8c89b]" /></div>
              <p className="mt-2 text-right text-[11px] text-white/40">A few minutes is enough to begin</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-white/8 bg-black/10 px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-[#e8c89b]">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A small loop that builds lasting recall.</h2>
              <p className="mt-4 text-sm leading-6 text-white/60 sm:text-base">Learn a topic, retrieve it without looking, then revisit it when it is ready for review.</p>
            </div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {steps.map(({ icon: Icon, title, description }, index) => (
                <article key={title} className="rounded-xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e8c89b]/10 text-[#e8c89b]"><Icon className="h-5 w-5" /></span>
                    <span className="text-xs font-medium text-white/35">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-16 sm:px-8 sm:py-20 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Ready to start with one topic?</h2>
            <p className="mt-2 text-sm text-white/55">Your next study session can be short and focused.</p>
          </div>
          <Link to="/login" className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#e8c89b] px-5 py-3 text-sm font-semibold text-[#211b18] transition hover:bg-[#f0d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]">
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <footer className="border-t border-white/10 px-5 py-6 text-sm text-white/45 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>MemoRoute · Learn by recalling, one topic at a time.</p>
          <Link to="/login" className="w-fit transition hover:text-white">Sign in</Link>
        </div>
      </footer>
    </div>
  )
}
