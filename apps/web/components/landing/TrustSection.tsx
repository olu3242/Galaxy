'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

function AnimatedCounter({
  target,
  suffix = '',
}: {
  target: number;
  suffix?: string;
}): React.ReactElement {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  useEffect(() => {
    if (!inView) return;
    const duration = 1500;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => {
      clearInterval(timer);
    };
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

const orgs = [
  'Covenant Church Lagos',
  'Lagos State PTA',
  'TechWomen Nigeria',
  'ACCA Ghana Chapter',
  'Afri-Coop Union',
  'Hope Community NGO',
  'Nairobi Young Leaders',
  'Cape Town Business Circle',
  'Accra Mothers Network',
  'Niger Delta Forum',
  'East Africa Scouts',
  'Kigali Innovation Hub',
];

export default function TrustSection(): React.ReactElement {
  return (
    <section className="py-20 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-sm text-galaxy-muted uppercase tracking-widest font-medium mb-8">
            Trusted by organizations across Africa and beyond
          </p>

          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {[
              { value: 120000, suffix: '+', label: 'Members' },
              { value: 400, suffix: '+', label: 'Organizations' },
              { value: 48000, suffix: '+', label: 'Activities tracked' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl sm:text-5xl font-bold gradient-text">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </p>
                <p className="text-sm text-galaxy-muted mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Marquee */}
        <div className="overflow-hidden relative">
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-galaxy-black to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-galaxy-black to-transparent z-10" />
          <motion.div
            animate={{ x: [0, -50 * orgs.length] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
            className="flex gap-3 w-max"
          >
            {[...orgs, ...orgs].map((org, i) => (
              <div
                key={i}
                className="flex-shrink-0 px-4 py-2 rounded-full bg-white/5 border border-white/8 text-sm text-galaxy-slate whitespace-nowrap"
              >
                {org}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
