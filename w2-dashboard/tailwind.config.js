/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        surface: '#1E293B',
        border: '#334155',
        muted: '#94A3B8',
        foreground: '#F1F5F9',
        anthropic: '#D97706',
        openai: '#059669',
        gemini: '#2563EB',
      },
    },
  },
  plugins: [],
}
