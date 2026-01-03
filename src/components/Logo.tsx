export const Logo = (
  { text = 'lm', size = '2.5em' }: { text?: string; size?: string },
) => (
  <h1
    className={`text-[${size}] relative font-extrabold font-[Turret_Road] bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent select-none`}
  >
    {text}
  </h1>
)
