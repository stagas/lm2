export class AnimationManager {
  private callbacks = new Set<() => void>()
  private animationId: number | null = null
  private isRunning = false

  register(callback: () => void) {
    this.callbacks.add(callback)
  }

  unregister(callback: () => void) {
    this.callbacks.delete(callback)
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.animate()
  }

  stop() {
    this.isRunning = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  private animate = () => {
    if (!this.isRunning) return

    for (const callback of this.callbacks) {
      callback()
    }

    this.animationId = requestAnimationFrame(this.animate)
  }
}
