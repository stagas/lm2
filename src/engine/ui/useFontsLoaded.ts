import { useEffect, useState } from 'preact/hooks'

export const useFontsLoaded = () => {
  const checkFontsLoaded = () => {
    // Create a temporary element to measure text
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    // Check multiple fonts to ensure they're loaded
    const fonts = ['Space Grotesk', 'Turret Road', 'Space Mono']
    // Check several weights for each font to ensure all are loaded
    const weights = [300, 400, 500, 600, 700, 800, 900]
    for (const font of fonts) {
      for (const weight of weights) {
        ctx.font = `${weight} 16px "${font}", monospace`
        const fontWidth = ctx.measureText('Test').width

        ctx.font = `${weight} 16px monospace`
        const fallbackWidth = ctx.measureText('Test').width

        // If this font at this weight hasn't loaded yet, return false
        if (fontWidth === fallbackWidth) {
          return false
        }
      }
    }

    return true
  }

  const [fontsLoaded, setFontsLoaded] = useState(checkFontsLoaded())

  useEffect(() => {
    if (fontsLoaded) return

    // Check immediately
    if (checkFontsLoaded()) {
      setFontsLoaded(true)
      return
    }

    // Poll until fonts are loaded
    const interval = setInterval(() => {
      if (checkFontsLoaded()) {
        setFontsLoaded(true)
        clearInterval(interval)
      }
    }, 10)

    // Fallback timeout
    const timeout = setTimeout(() => {
      clearInterval(interval)
      setFontsLoaded(true)
    }, 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  return fontsLoaded
}
