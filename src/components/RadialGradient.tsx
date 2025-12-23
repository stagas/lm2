export function RadialGradient({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-row gap-2 w-full h-full relative"
      style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(0,0,0,0.0) 100%)' }}
    >
      {children}
    </div>
  )
}
