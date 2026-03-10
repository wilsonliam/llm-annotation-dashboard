import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#D97706',
  openai: '#059669',
  gemini: '#2563EB',
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'GPT-4o (OpenAI)',
  gemini: 'Gemini (Google)',
}

export function formatPct(v: number) {
  return (v * 100).toFixed(1) + '%'
}

export function formatNum(v: number, decimals = 3) {
  return v.toFixed(decimals)
}
