import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'galaxy-black': '#070B14',
        'galaxy-navy': '#0F172A',
        'galaxy-violet': '#6D5DFC',
        'galaxy-blue': '#4D7CFE',
        'galaxy-teal': '#22C7A9',
        'galaxy-white': '#F8FAFC',
        'galaxy-slate': '#CBD5E1',
        'galaxy-muted': '#64748B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};

export default config;
