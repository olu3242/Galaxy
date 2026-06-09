'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function CTA(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <section id="cta" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-galaxy-navy/40">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-galaxy-violet/15 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-4">
            Get started today
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-galaxy-white mb-5 leading-tight">
            Your organization, <span className="gradient-text">fully in control</span>
          </h2>
          <p className="text-galaxy-muted text-lg mb-10">
            Join 400+ organizations that run with clarity. Free to start, no credit card required.
          </p>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-3 bg-galaxy-teal/10 border border-galaxy-teal/20 text-galaxy-teal px-6 py-4 rounded-2xl"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-medium">
                You&apos;re on the list. We&apos;ll be in touch shortly.
              </span>
            </motion.div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="Enter your work email"
                required
                className="flex-1 bg-white/5 border border-white/10 text-galaxy-white placeholder-galaxy-muted rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-galaxy-violet transition-colors"
              />
              <button
                type="submit"
                className="bg-galaxy-violet hover:bg-galaxy-blue transition-colors text-white font-medium px-6 py-3 rounded-xl text-sm whitespace-nowrap"
              >
                Get started free
              </button>
            </form>
          )}

          <p className="text-xs text-galaxy-muted mt-4">
            Free plan available. No credit card required. Set up in under 5 minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
            {[
              'Get started in minutes — no complex setup',
              'Members join easily — no software installation required',
              'Works alongside the tools your team already uses',
            ].map((bullet) => (
              <div key={bullet} className="flex items-center gap-2 text-xs text-galaxy-muted">
                <svg
                  className="w-4 h-4 text-galaxy-teal flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
