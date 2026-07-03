import { modelFamily } from '@/lib/models'

/** CSS color value for a model's family LED / accent (maps `modelFamily` → theme token). */
export function hueVar(model: string): string {
  switch (modelFamily(model)) {
    case 'opus':
      return 'var(--color-opus)'
    case 'sonnet':
      return 'var(--color-sonnet)'
    case 'haiku':
      return 'var(--color-haiku)'
    case 'rawid':
      return 'var(--color-rawid)'
    case 'inherit':
      return 'var(--color-led-inherit)'
  }
}

/** Short model label for compact UI (e.g. `opus-4-8`); `inherit`/raw ids pass through. */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, '')
}
