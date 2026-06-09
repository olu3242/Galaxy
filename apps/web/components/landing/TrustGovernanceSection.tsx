'use client';

import { motion } from 'framer-motion';

const cards = [
  {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
      </svg>
    ),
    title: 'Complete Visibility',
    description: 'See every action, request, and decision across your organization in one place.',
    color: 'text-galaxy-violet',
    bg: 'bg-galaxy-violet/10 border-galaxy-violet/20',
  },
  {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        />
      </svg>
    ),
    title: 'Role-Based Access',
    description:
      'Control who can see and do what. Set permissions for every role in your organization.',
    color: 'text-galaxy-blue',
    bg: 'bg-galaxy-blue/10 border-galaxy-blue/20',
  },
  {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
    title: 'Approval Controls',
    description:
      'Nothing moves forward without the right people signing off. Every approval is tracked.',
    color: 'text-galaxy-teal',
    bg: 'bg-galaxy-teal/10 border-galaxy-teal/20',
  },
  {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
    ),
    title: 'Complete History',
    description: 'Every activity is logged and searchable. Full accountability, always.',
    color: 'text-galaxy-violet',
    bg: 'bg-galaxy-violet/10 border-galaxy-violet/20',
  },
];

export default function TrustGovernanceSection(): React.ReactElement {
  return (
    <section className="py-24 bg-galaxy-navy/30">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            Built for accountability
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            Your organization, your control
          </h2>
          <p className="text-galaxy-muted max-w-xl mx-auto text-lg">
            Galaxy gives leadership total oversight without micromanagement — and gives teams the
            clarity to act with confidence.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass rounded-2xl p-7 flex gap-5"
            >
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${card.bg} ${card.color}`}
              >
                {card.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-galaxy-white mb-2">{card.title}</h3>
                <p className="text-galaxy-muted leading-relaxed text-sm">{card.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
