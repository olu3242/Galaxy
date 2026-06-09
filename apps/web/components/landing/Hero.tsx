'use client';

import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1 },
  }),
};

function MissionControlCard(): React.ReactElement {
  return (
    <div className="relative w-full max-w-md mx-auto lg:mx-0">
      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="glass rounded-2xl p-5 glow-violet"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-galaxy-muted uppercase tracking-wider font-medium">
              Mission Control
            </p>
            <p className="text-sm text-galaxy-white font-semibold mt-0.5">Finance Committee</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-galaxy-teal animate-pulse" />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Members active', value: '94%' },
            { label: 'Tasks done', value: '247' },
            { label: 'On schedule', value: '12/14' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white/5 rounded-xl p-3">
              <p className="text-lg font-bold text-galaxy-white">{kpi.value}</p>
              <p className="text-xs text-galaxy-muted mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {[
            {
              name: 'Ada N.',
              action: 'Submitted Q3 report',
              time: '2m ago',
              color: 'bg-galaxy-teal',
            },
            {
              name: 'Emeka O.',
              action: 'Approved budget review',
              time: '15m ago',
              color: 'bg-galaxy-violet',
            },
            {
              name: 'Sarah K.',
              action: 'Completed audit checklist',
              time: '1h ago',
              color: 'bg-galaxy-blue',
            },
          ].map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full ${item.color} flex items-center justify-center flex-shrink-0`}
              >
                <span className="text-white text-xs font-semibold">{item.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-galaxy-white truncate">
                  <span className="font-medium">{item.name}</span> {item.action}
                </p>
              </div>
              <span className="text-xs text-galaxy-muted flex-shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Floating approval card */}
      <motion.div
        initial={{ opacity: 0, x: 30, y: -10 }}
        animate={{ opacity: 1, x: 0, y: -10 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        className="absolute -top-4 -right-4 glass rounded-xl p-3 w-44 hidden lg:block"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-galaxy-teal/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-galaxy-teal" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="text-xs font-medium text-galaxy-white">Approved</span>
        </div>
        <p className="text-xs text-galaxy-muted">Annual budget submitted and approved</p>
      </motion.div>

      {/* Floating pending card */}
      <motion.div
        initial={{ opacity: 0, x: -20, y: 20 }}
        animate={{ opacity: 1, x: -20, y: 20 }}
        transition={{ duration: 0.5, delay: 0.9 }}
        className="absolute -bottom-2 -left-4 glass rounded-xl p-3 w-40 hidden lg:block"
      >
        <p className="text-xs text-galaxy-muted mb-1">Pending approvals</p>
        <p className="text-xl font-bold text-galaxy-white">3</p>
        <div className="flex gap-1 mt-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full bg-galaxy-violet/30 border border-galaxy-violet/50"
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function Hero(): React.ReactElement {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-galaxy-black">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-galaxy-violet/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-galaxy-teal/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-16 grid lg:grid-cols-2 gap-16 items-center w-full">
        {/* Left */}
        <div>
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-galaxy-violet/10 border border-galaxy-violet/20 mb-6"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-galaxy-teal animate-pulse" />
            <span className="text-xs font-medium text-galaxy-violet">
              400+ organizations trust Galaxy
            </span>
          </motion.div>

          <motion.h1
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-galaxy-white mb-6"
          >
            The operating system <span className="gradient-text">every organization</span> has been
            waiting for
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-lg text-galaxy-muted leading-relaxed mb-8 max-w-xl"
          >
            Galaxy gives every team the clarity, coordination, and accountability to operate at
            their best — without complexity, without chaos.
          </motion.p>

          <motion.div
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap gap-3"
          >
            <a
              href="#cta"
              className="inline-flex items-center gap-2 bg-galaxy-violet hover:bg-galaxy-blue transition-colors text-white font-medium px-6 py-3 rounded-xl text-sm"
            >
              Get Galaxy for free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 text-galaxy-muted hover:text-galaxy-white transition-colors font-medium px-6 py-3 rounded-xl text-sm border border-white/10 hover:border-white/20"
            >
              See how it works
            </a>
          </motion.div>

          <motion.div
            custom={4}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-6 mt-10"
          >
            <div className="flex -space-x-2">
              {['#6D5DFC', '#22C7A9', '#4D7CFE', '#F59E0B'].map((color, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-galaxy-black"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <p className="text-sm text-galaxy-muted">
              Trusted by <span className="text-galaxy-white font-medium">120,000+</span> members
              worldwide
            </p>
          </motion.div>
        </div>

        {/* Right — Mission Control visual */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex justify-center lg:justify-end"
        >
          <MissionControlCard />
        </motion.div>
      </div>
    </section>
  );
}
