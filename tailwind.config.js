/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bw-black': '#000000',
        'bw-white': '#FFFFFF',
        'cream': '#FAF8F5',
        'cream-dark': '#F3F0EB',
        'warm-black': '#1A1817',
        'warm-gray': '#6B6560',
        'warm-gray-light': '#9A958F',
        'status-success': '#22c55e',
        'status-error': '#ef4444',
        'status-warning': '#f59e0b',
      },
      fontFamily: {
        'sans': ['Inter Variable', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'mono': ['JetBrains Mono Variable', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'card': '12px',
        'card-lg': '16px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'scale-in': 'scaleIn 0.35s ease-out forwards',
        'pulse-slow': 'pulseSlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
}
