'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    q: 'What kinds of organizations use Galaxy?',
    a: 'Galaxy is built for any structured organization — churches, NGOs, schools, associations, cooperatives, community groups, and more. If you have members, activities, and a need for accountability, Galaxy is for you.',
  },
  {
    q: 'Is Galaxy only for large organizations?',
    a: 'Not at all. Galaxy works for organizations of 20 people and scales to federations with thousands of members. You start simple and expand as you grow.',
  },
  {
    q: 'How long does it take to get started?',
    a: 'Most organizations are fully operational within 48 hours. Setup takes minutes, onboarding your team takes a day, and your first structured operations run starts immediately.',
  },
  {
    q: 'Do my members need to learn new software?',
    a: "Galaxy is designed to work through channels your members already use daily. There's no steep learning curve and no app download required for most interactions.",
  },
  {
    q: 'How does Galaxy handle privacy and data security?',
    a: "Your organization's data belongs to you. Galaxy uses enterprise-grade encryption, strict access controls, and is fully compliant with global data privacy standards. Your members' information is never sold or shared.",
  },
  {
    q: 'Can we migrate our existing data and history?',
    a: "Yes. Our team works with you to import your existing member records, history, and documents. You don't lose your past when you move to Galaxy.",
  },
];

function FAQItem({
  faq,
  index,
}: {
  faq: { q: string; a: string };
  index: number;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="border-b border-white/5"
    >
      <button
        className="w-full flex items-center justify-between py-5 text-left gap-4"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="text-sm font-medium text-galaxy-white">{faq.q}</span>
        <motion.div
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 w-5 h-5 text-galaxy-muted"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="text-sm text-galaxy-muted leading-relaxed pb-5">{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQ(): React.ReactElement {
  return (
    <section id="faq" className="py-24">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white">Common questions</h2>
        </motion.div>

        <div>
          {faqs.map((faq, i) => (
            <FAQItem key={faq.q} faq={faq} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
