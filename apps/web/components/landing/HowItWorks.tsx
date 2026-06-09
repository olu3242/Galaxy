'use client';

import { motion } from 'framer-motion';

const steps = [
  {
    number: '01',
    title: 'Set up in minutes',
    body: 'Create your organization, invite your team, and configure your structure — no IT department required. Galaxy adapts to how you already work.',
    highlight: 'No training needed',
  },
  {
    number: '02',
    title: 'Run your operations',
    body: 'Submit reports, approve requests, track attendance, and manage decisions — all through a single, familiar interface your team will actually use.',
    highlight: 'Works where your team is',
  },
  {
    number: '03',
    title: 'Lead with clarity',
    body: "See everything happening across your organization in real time. Know who's engaged, what's pending, and where you need to act — before problems escalate.",
    highlight: 'Real-time visibility',
  },
];

export default function HowItWorks(): React.ReactElement {
  return (
    <section id="how-it-works" className="py-24 bg-galaxy-navy/30">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            From scattered to structured in days
          </h2>
          <p className="text-galaxy-muted max-w-xl mx-auto text-lg">
            Galaxy replaces the chaos of group chats and spreadsheets with one coherent system.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative"
            >
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-galaxy-violet/30 to-transparent -translate-x-8 z-0" />
              )}
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl gradient-violet flex items-center justify-center mb-5 glow-violet">
                  <span className="text-white font-bold text-lg">{step.number}</span>
                </div>
                <h3 className="text-xl font-semibold text-galaxy-white mb-3">{step.title}</h3>
                <p className="text-galaxy-muted leading-relaxed mb-4">{step.body}</p>
                <div className="inline-flex items-center gap-2 text-xs font-medium text-galaxy-teal bg-galaxy-teal/10 px-3 py-1.5 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-galaxy-teal" />
                  {step.highlight}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
