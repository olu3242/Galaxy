'use client';

import { motion } from 'framer-motion';

const outcomes = [
  {
    metric: '3×',
    label: 'faster reporting',
    description: 'Teams that used to spend a week on reports now submit in under 2 hours.',
    color: 'text-galaxy-violet',
    bg: 'bg-galaxy-violet/10',
  },
  {
    metric: '94%',
    label: 'meeting attendance',
    description: 'Automated reminders and simplified check-in drive consistent participation.',
    color: 'text-galaxy-teal',
    bg: 'bg-galaxy-teal/10',
  },
  {
    metric: '0',
    label: 'decisions lost',
    description: 'Every agreement is captured, attributed, and searchable — permanently.',
    color: 'text-galaxy-blue',
    bg: 'bg-galaxy-blue/10',
  },
  {
    metric: '100%',
    label: 'accountability',
    description: 'Every action has an owner, a deadline, and a visible status.',
    color: 'text-galaxy-violet',
    bg: 'bg-galaxy-violet/10',
  },
  {
    metric: '2 days',
    label: 'to full adoption',
    description: 'Teams are fully operational within 48 hours of signing up.',
    color: 'text-galaxy-teal',
    bg: 'bg-galaxy-teal/10',
  },
];

export default function OutcomesSection(): React.ReactElement {
  return (
    <section id="outcomes" className="py-24 bg-galaxy-navy/20">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            Outcomes
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            Results organizations actually see
          </h2>
          <p className="text-galaxy-muted max-w-xl mx-auto text-lg">
            Not theoretical improvements. Real changes that leaders notice in their first month.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {outcomes.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className={`${item.bg} border border-white/5 rounded-2xl p-6`}
            >
              <p className={`text-4xl font-bold ${item.color} mb-1`}>{item.metric}</p>
              <p className="text-sm font-semibold text-galaxy-white mb-2 capitalize">
                {item.label}
              </p>
              <p className="text-sm text-galaxy-muted leading-relaxed">{item.description}</p>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="glass rounded-2xl p-6 flex flex-col justify-between"
          >
            <p className="text-base font-semibold text-galaxy-white mb-3">
              &ldquo;Galaxy gave us our organization back.&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-galaxy-violet flex items-center justify-center text-white text-sm font-bold">
                E
              </div>
              <div>
                <p className="text-sm font-medium text-galaxy-white">Emmanuel A.</p>
                <p className="text-xs text-galaxy-muted">Senior Pastor, Lagos</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
