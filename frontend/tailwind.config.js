/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#0F172A', canvas: '#F8FAFC', primary: '#2563EB', success: '#10B981', warning: '#F59E0B', danger: '#EF4444', line: '#E2E8F0', muted: '#64748B' },
      borderRadius: { card: '24px' },
      boxShadow: { card: '0 2px 8px rgba(15, 23, 42, 0.04)', lift: '0 12px 28px rgba(15, 23, 42, 0.09)' }
    }
  },
  plugins: []
};
