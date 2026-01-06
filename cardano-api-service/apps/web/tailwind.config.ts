import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-primary': '#0a0a0f',
        'bg-secondary': '#111118',
        'bg-tertiary': '#1a1a24',
        
        // Borders
        'border': '#2a2a3a',
        'border-highlight': '#3a3a4a',
        
        // Accent colors (Purple)
        'accent': {
          DEFAULT: '#8b5cf6',
          hover: '#a78bfa',
          muted: '#6d28d9',
          glow: 'rgba(139, 92, 246, 0.15)',
        },
        
        // Semantic
        'success': '#22c55e',
        'warning': '#f59e0b',
        'error': '#ef4444',
        'info': '#3b82f6',
        
        // Text
        'text': {
          primary: '#f8fafc',
          secondary: '#94a3b8',
          muted: '#64748b',
          accent: '#a78bfa',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 50%, #06b6d4 100%)',
        'gradient-card': 'linear-gradient(180deg, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
        'gradient-mesh': 'radial-gradient(ellipse at 20% 0%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
      },
      keyframes: {
        'fade-slide-up': {
          'from': {
            opacity: '0',
            transform: 'translateY(20px)'
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)'
          }
        }
      },
      animation: {
        'fade-slide-up': 'fade-slide-up 0.5s ease-out forwards',
      }
    },
  },
  plugins: [],
}

export default config




