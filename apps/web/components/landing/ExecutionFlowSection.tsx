'use client';

import { motion } from 'framer-motion';

const steps = [
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
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    title: 'Request',
    description: 'A team member submits a request, report, or task through Galaxy.',
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
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    title: 'Assignment',
    description: 'The right person is notified and knows exactly what to do.',
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
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    title: 'Tracking',
    description: 'Progress is visible to leadership at every stage — no chasing needed.',
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
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    title: 'Approval',
    description: 'Decision-makers review and approve with a complete record of who signed off.',
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
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    ),
    title: 'Outcome',
    description: 'Results are logged, reported, and available for future reference.',
  },
];

export default function ExecutionFlowSection(): React.ReactElement {
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
            How operations flow
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            From request to result — every time
          </h2>
          <p className="text-galaxy-muted max-w-xl mx-auto text-lg">
            Every operation in your organization follows a clear, consistent path. Nothing stalls.
            Nothing disappears.
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-0">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="flex lg:flex-col items-center lg:items-start flex-1 w-full"
            >
              <div className="flex lg:flex-col items-start gap-4 lg:gap-0 flex-1">
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                  className="flex flex-col items-center w-full"
                >
                  {/* Icon + connector row */}
                  <div className="flex items-center w-full mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-galaxy-violet/10 border border-galaxy-violet/20 flex items-center justify-center text-galaxy-violet flex-shrink-0">
                      {step.icon}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="hidden lg:block flex-1 h-px bg-gradient-to-r from-galaxy-violet/40 to-galaxy-violet/10 mx-3" />
                    )}
                  </div>

                  {/* Text */}
                  <div className="w-full pr-4">
                    <p className="text-xs font-semibold text-galaxy-violet uppercase tracking-wider mb-1">
                      Step {i + 1}
                    </p>
                    <h3 className="text-base font-semibold text-galaxy-white mb-2">{step.title}</h3>
                    <p className="text-sm text-galaxy-muted leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              </div>

              {/* Mobile arrow */}
              {i < steps.length - 1 && (
                <div className="lg:hidden flex justify-center py-2 w-full">
                  <svg
                    className="w-4 h-4 text-galaxy-violet/40 rotate-90"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
