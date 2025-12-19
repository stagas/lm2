export class Smoothed {
  value: f64 = Infinity
  target: f64 = Infinity
  private smoothingTarget: f64 = 0.03
  private smoothingValue: f64 = 0.0007
  set(target: f64): void {
    // Initialize from the first observed target to avoid ramping from zero on startup.
    if (this.value === Infinity && this.target === Infinity) {
      this.value = target
      this.target = target
      return
    }
    this.target += (target - this.target) * this.smoothingTarget
  }
  update(): void {
    this.value += (this.target - this.value) * this.smoothingValue
  }

  copyFrom(other: Smoothed): void {
    this.value = other.value
    this.target = other.target
    this.smoothingTarget = other.smoothingTarget
    this.smoothingValue = other.smoothingValue
  }
}
