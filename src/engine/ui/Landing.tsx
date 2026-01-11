import { ChartLineIcon, CodeIcon, GlobeIcon, LightningIcon, MusicNoteIcon, MusicNotesIcon } from '@phosphor-icons/react'
import { useCallback } from 'preact/hooks'
import { Logo } from '../../components/Logo.tsx'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { InlineEditor } from './docs/InlineEditor.tsx'
import { Link, useRouter } from './router.tsx'

const exampleCode = `tb303=(hz,cutoff,q,k,sat,trig)->

  diodeladder(ramp(hz),cutoff,q,k,sat) |> tanh($*6)*.5 |> dc($)

trig=every(1/16) tb303([#1*o2,#1*o2,#7*o2,#5*o3].glide(1/8,10),

cutoff:100+(300 (0 5k) +2k*fractal(6)**3)*ad(.01,3,30,trig),

q:.91,k:.002,sat:1.15,trig)*.4+bd()+hh()+sd()

|> limiter($) |> out($)`

const features = [
  {
    title: 'Live Coding',
    description: 'Write audio code in real-time. See and hear your changes instantly as you type.',
    icon: LightningIcon,
  },
  {
    title: 'Powerful DSP',
    description:
      'Built-in synthesizers, effects, filters, and sequencing tools. All running in WebAssembly for maximum performance.',
    icon: MusicNoteIcon,
  },
  {
    title: 'Visual Feedback',
    description: 'Interactive widgets show waveforms, envelopes, and signal flow. Understand your audio visually.',
    icon: ChartLineIcon,
  },
  {
    title: 'Sequencing',
    description: 'Pattern-based sequencing with euclidean rhythms, triggers, and timeline composition.',
    icon: MusicNotesIcon,
  },
  {
    title: 'No Installation',
    description: 'Runs entirely in your browser. No plugins, no downloads. Just open and create.',
    icon: GlobeIcon,
  },
  {
    title: 'Open Source',
    description: 'Built with modern web technologies. Extensible and transparent.',
    icon: CodeIcon,
  },
]

const testimonials = [
  {
    quote: 'The most intuitive audio programming environment I\'ve used. The live coding experience is incredible.',
    author: 'Alex M.',
    role: 'Electronic Music Producer',
  },
  {
    quote:
      'Finally, a tool that makes audio programming accessible. The visual feedback helps me understand what I\'m creating.',
    author: 'Sam R.',
    role: 'Sound Designer',
  },
  {
    quote: 'I love being able to experiment with sounds directly in the browser. No setup, just pure creativity.',
    author: 'Jordan K.',
    role: 'Music Technologist',
  },
]

function EnterAppButton({ className = '' }: { className?: string }) {
  const { navigate } = useRouter()
  const handleClick = useCallback(() => {
    navigate('/app')
  }, [navigate])

  return (
    <button
      onClick={handleClick}
      className={`px-8 py-4 bg-gradient-to-br from-orange-400 to-red-600 text-white font-semibold rounded-lg ${className}`}
    >
      Enter App
    </button>
  )
}

function BrowseLoopsButton({ className = '' }: { className?: string }) {
  const { navigate } = useRouter()
  const handleClick = useCallback(() => {
    navigate('/browse')
  }, [navigate])

  return (
    <button
      onClick={handleClick}
      className={`px-8 py-4 bg-gradient-to-br from-orange-400 to-red-600 text-white font-semibold rounded-lg ${className}`}
    >
      Browse Loops
    </button>
  )
}

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white relative">
      <RadialGradient>
        <div className="relative">
          {/* Hero Section */}
          <section className="relative overflow-hidden">
            <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-20">
              <div className="text-center mb-12">
                <Logo text="loopmaster" size="4em" />
                <p className="mt-6 text-xl md:text-2xl text-neutral-300 max-w-2xl mx-auto">
                  Audio programming — code your sounds in real-time
                </p>
                <div className="mt-8 flex gap-4 justify-center items-center flex-wrap">
                  <EnterAppButton />
                  <span className="text-neutral-500">or</span>
                  <BrowseLoopsButton />
                </div>
              </div>

              {/* Example Editor */}
              <div className="mt-16 max-w-4xl mx-auto">
                <div className="mb-4 text-center">
                  <h2 className="text-2xl font-semibold text-white mb-2">Try it live</h2>
                  <p className="text-neutral-400">Edit the code below and press play to hear your changes</p>
                </div>
                <div className="bg-black">
                  <InlineEditor id="landing-example" initialCode={`${exampleCode}`} />
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="py-20 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 relative z-10">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-white mb-4">Everything you need</h2>
                <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
                  A complete audio programming environment built for creativity
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {features.map((feature, i) => {
                  const IconComponent = feature.icon
                  return (
                    <div
                      key={i}
                      className="p-6 border-2 border-orange-600 bg-black rounded-lg hover:border-yellow-400 transition-colors"
                    >
                      <div className="mb-4 text-yellow-400">
                        <IconComponent weight="regular" size={48} />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-neutral-400 leading-relaxed">{feature.description}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-12 text-center flex gap-4 justify-center items-center flex-wrap">
                <EnterAppButton />
                <span className="text-neutral-500">or</span>
                <BrowseLoopsButton />
              </div>
            </div>
          </section>

          {/* Testimonials Section */}
          <section className="py-20 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 relative z-10">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-white mb-4">What creators are saying</h2>
                <p className="text-xl text-neutral-400">Join the community of audio programmers</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {testimonials.map((testimonial, i) => (
                  <div
                    key={i}
                    className="p-6 border-2 border-orange-600 bg-black rounded-lg"
                  >
                    <p className="text-neutral-300 leading-relaxed mb-4 italic">"{testimonial.quote}"</p>
                    <div className="pt-4 border-t-2 border-yellow-400">
                      <p className="font-semibold text-white">{testimonial.author}</p>
                      <p className="text-sm text-neutral-500">{testimonial.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-20 relative overflow-hidden">
            <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
              <h2 className="text-4xl font-bold text-white mb-4">Ready to create?</h2>
              <p className="text-xl text-neutral-300 mb-8 max-w-2xl mx-auto">
                Start coding your sounds right now. No signup required, no installation needed.
              </p>
              <div className="flex gap-4 justify-center items-center flex-wrap">
                <EnterAppButton />
                <span className="text-neutral-500">or</span>
                <BrowseLoopsButton />
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="py-12">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <Logo text="loopmaster" size="2em" />
                </div>
                <div className="flex gap-6 text-neutral-400">
                  <Link to="/docs"
                    className="hover:text-yellow-400 transition-colors border-b-2 border-transparent hover:border-yellow-400"
                  >
                    Documentation
                  </Link>
                  <Link to="/docs/about/contact"
                    className="hover:text-yellow-400 transition-colors border-b-2 border-transparent hover:border-yellow-400"
                  >
                    Contact
                  </Link>
                </div>
              </div>
              <div className="mt-8 text-center text-sm text-neutral-500">
                © {new Date().getFullYear()} loopmaster. Built for creators.
              </div>
            </div>
          </footer>
        </div>
      </RadialGradient>
    </div>
  )
}
