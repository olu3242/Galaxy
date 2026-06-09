'use client';

import { motion } from 'framer-motion';

const beforeItems = [
  'Decisions get lost',
  'Follow-ups are manual',
  'Approvals take days',
  'No visibility across the organization',
  'Work falls through the cracks',
];

const afterItems = [
  'Every request is tracked',
  'Accountability is clear',
  'Approvals move faster',
  'Real-time visibility for leadership',
  'Nothing important gets forgotten',
];

export default function BeforeAfterSection(): React.ReactElement {
  return (
    <section className="py-24 bg-galaxy-navy/20">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            The difference
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white">
            Life before and after Galaxy
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* BEFORE */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass rounded-2xl p-8 border border-red-500/10 bg-red-950/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-4 h-4 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-red-300">Before Galaxy</h3>
            </div>
            <ul className="space-y-4">
              {beforeItems.map((item, i) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                  className="flex items-center gap-3 text-galaxy-muted"
                >
                  <svg
                    className="w-5 h-5 text-red-500/60 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm">{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* AFTER */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass rounded-2xl p-8 border border-galaxy-teal/20 bg-galaxy-teal/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-galaxy-teal/15 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-4 h-4 text-galaxy-teal"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-galaxy-teal">With Galaxy</h3>
            </div>
            <ul className="space-y-4">
              {afterItems.map((item, i) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                  className="flex items-center gap-3 text-galaxy-slate"
                >
                  <svg
                    className="w-5 h-5 text-galaxy-teal flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-medium">{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
