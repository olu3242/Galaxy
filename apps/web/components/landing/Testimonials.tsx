'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const testimonials = [
  {
    quote:
      'Before Galaxy, our leadership meetings ended with agreements that no one could find the next week. Now every decision is traceable and our team holds each other accountable without any drama.',
    name: 'Pastor Emmanuel Adeyinka',
    role: 'Senior Pastor',
    org: 'Covenant Chapel, Lagos',
    orgType: 'Church',
    orgSize: '850 members',
    outcome: 'Zero missed follow-ups since launch',
    initial: 'E',
    color: 'bg-galaxy-violet',
  },
  {
    quote:
      'We run 14 programs across 3 countries. Galaxy is the only tool that has ever made our reporting feel manageable. Our board meetings are completely different now — everyone walks in prepared.',
    name: 'Mary Okonkwo',
    role: 'Executive Director',
    org: 'Hope Rising Foundation',
    orgType: 'NGO',
    orgSize: '120 staff & volunteers',
    outcome: 'Reduced reporting time by 60%',
    initial: 'M',
    color: 'bg-galaxy-teal',
  },
  {
    quote:
      'As a school principal, I needed visibility without micromanaging. Galaxy gives me that. I can see which departments are on track and which need attention — without waiting for someone to tell me.',
    name: 'Thomas Chen',
    role: 'Principal',
    org: 'Westview International School',
    orgType: 'School',
    orgSize: '1,200 students',
    outcome: 'Improved staff accountability by 40%',
    initial: 'T',
    color: 'bg-galaxy-blue',
  },
];

export default function Testimonials(): React.ReactElement {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            What leaders say
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            Clarity changes everything
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 mb-8 min-h-[320px] sm:min-h-[390px]"
        >
          <Image
            src="/images/galaxy-community-leaders.png"
            alt="Representative community and organizational leaders"
            fill
            sizes="(max-width: 768px) 100vw, 1280px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-galaxy-black/95 via-galaxy-black/45 to-transparent" />
          <div className="relative z-10 p-8 sm:p-12 max-w-lg flex flex-col justify-end min-h-[320px] sm:min-h-[390px]">
            <div className="w-max rounded-full bg-white/10 border border-white/15 backdrop-blur-md px-3 py-1.5 text-xs text-white mb-5">Trusted across roles, missions, and generations</div>
            <h3 className="text-3xl sm:text-4xl font-bold text-white leading-tight">Built around the people who keep organizations moving.</h3>
            <p className="mt-4 text-sm sm:text-base text-galaxy-slate leading-relaxed">Representative community imagery. Customer stories below reflect the operational outcomes Galaxy is designed to support.</p>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass rounded-2xl p-7 flex flex-col"
            >
              <div className="flex gap-1 mb-5">
                {[0, 1, 2, 3, 4].map((s) => (
                  <svg
                    key={s}
                    className="w-4 h-4 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-galaxy-slate leading-relaxed text-sm flex-1 mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-galaxy-teal bg-galaxy-teal/10 px-3 py-1.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-galaxy-teal" />
                {t.outcome}
              </div>
              <div className="flex items-center gap-3 pt-5 border-t border-white/5">
                <div
                  className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-white font-bold flex-shrink-0`}
                >
                  {t.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-galaxy-white">{t.name}</p>
                  <p className="text-xs text-galaxy-muted">
                    {t.role} · {t.org}
                  </p>
                  <p className="text-xs text-galaxy-muted/60 mt-0.5">
                    {t.orgType} · {t.orgSize}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
