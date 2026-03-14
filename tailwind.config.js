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
    },
  },
  plugins: [],
}
