'use client';

import { Syne, DM_Sans } from 'next/font/google';
import { useEffect, useRef, useState } from 'react';

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-head',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
});

const faqs = [
  {
    q: 'Do my members need to download a new app?',
    a: "No — and that's the point. Your team keeps communicating exactly as they do now. Galaxy works behind the scenes to bring structure and accountability to those conversations. The only people who access a dedicated dashboard are administrators and leaders.",
  },
  {
    q: 'How long does setup take?',
    a: 'Most organizations are fully operational within 24-48 hours. Galaxy is configured around your organization type with pre-built templates for churches, NGOs, schools, cooperatives, and associations. Our team provides hands-on onboarding for every early access organization at no extra cost.',
  },
  {
    q: 'Is Galaxy secure?',
    a: "Yes. Each organization's data is completely isolated — no other organization can see your information. All data is encrypted in transit and at rest. We take data security seriously, particularly for organizations working with sensitive member, beneficiary, and financial information.",
  },
  {
    q: 'What types of organizations use Galaxy?',
    a: 'Galaxy is purpose-built for churches and faith communities, NGOs and field organizations, schools and academic institutions, cooperatives and savings groups, professional associations, community networks, and civic organizations. We have dedicated templates and workflows for each.',
  },
  {
    q: 'Can we start small and grow?',
    a: 'Absolutely. Many organizations start with one department or team before rolling out organization-wide. Galaxy is designed to scale with you — from 50 members to 50,000. Pricing and features grow with your needs, not the other way around.',
  },
  {
    q: 'Does Galaxy work internationally?',
    a: 'Yes. Galaxy is built for global organizations and is particularly focused on organizations across Africa, the Caribbean, Latin America, and South and Southeast Asia. Multiple languages and regional configurations are supported.',
  },
];

function useCounter(target: number, trigger: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    const duration = 2000;
    const start = performance.now();
    function update(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * target));
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }, [trigger, target]);
  return value;
}

function Counter({ target, suffix }: { target: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [triggered, setTriggered] = useState(false);
  const value = useCounter(target, triggered);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setTriggered(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
    };
  }, []);

  return (
    <span ref={ref} className="metric-value">
      {value}
      {suffix}
    </span>
  );
}

function FaqItem({ q, a, index: _index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item${open ? ' open' : ''}`}>
      <button
        className="faq-q"
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
      >
        <span className="faq-q-text">{q}</span>
        <div className="faq-icon">+</div>
      </button>
      <div className="faq-a" aria-hidden={!open}>
        <div className="faq-a-text">{a}</div>
      </div>
    </div>
  );
}

export default function GalaxyPage(): React.ReactElement {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ctaEmail, setCtaEmail] = useState('');
  const [ctaMsg, setCtaMsg] = useState<{ text: string; color: string } | null>(null);

  // Nav scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.08 },
    );
    document.querySelectorAll('.reveal').forEach((el) => {
      obs.observe(el);
    });
    return () => {
      obs.disconnect();
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  function handleCtaSubmit() {
    if (!ctaEmail.includes('@')) {
      setCtaMsg({ text: 'Please enter a valid email address.', color: '#f87171' });
      return;
    }
    setCtaMsg({ text: "✓ You're on the waitlist. We'll be in touch very soon.", color: '#22C7A9' });
    setCtaEmail('');
  }

  function scrollToWaitlist(e: React.MouseEvent) {
    e.preventDefault();
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div
      className={`${syne.variable} ${dmSans.variable}`}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* NAV */}
      <nav
        id="nav"
        className={scrolled ? 'scrolled' : ''}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        <a href="#" className="logo" style={{ fontFamily: 'var(--font-head)' }}>
          <div className="logo-mark">G</div>
          <span className="logo-name">Galaxy</span>
        </a>
        <div className="nav-links">
          <a href="#solutions" className="nav-link">
            Solutions
          </a>
          <a href="#customers" className="nav-link">
            Customers
          </a>
          <a href="#testimonials" className="nav-link">
            Testimonials
          </a>
          <a href="#faq" className="nav-link">
            FAQ
          </a>
          <a href="mailto:hello@galaxyos.co" className="nav-link">
            Contact
          </a>
        </div>
        <div className="nav-ctas">
          <a href="#waitlist" className="btn-ghost">
            Join Waitlist
          </a>
          <a href="mailto:hello@galaxyos.co" className="btn-primary">
            Book a Demo
          </a>
        </div>
        <button
          className="mobile-toggle"
          onClick={() => {
            setMobileOpen(true);
          }}
          aria-label="Open menu"
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu${mobileOpen ? ' open' : ''}`} id="mobileMenu">
        <button
          className="mobile-close"
          onClick={() => {
            setMobileOpen(false);
          }}
          aria-label="Close menu"
        >
          ✕
        </button>
        <a
          href="#solutions"
          className="nav-link"
          style={{ fontFamily: 'var(--font-head)' }}
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Solutions
        </a>
        <a
          href="#customers"
          className="nav-link"
          style={{ fontFamily: 'var(--font-head)' }}
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Customers
        </a>
        <a
          href="#testimonials"
          className="nav-link"
          style={{ fontFamily: 'var(--font-head)' }}
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Testimonials
        </a>
        <a
          href="#faq"
          className="nav-link"
          style={{ fontFamily: 'var(--font-head)' }}
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          FAQ
        </a>
        <a
          href="mailto:hello@galaxyos.co"
          className="nav-link"
          style={{ fontFamily: 'var(--font-head)' }}
        >
          Contact
        </a>
        <a
          href="#waitlist"
          className="btn-hero-primary"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Join Waitlist
        </a>
        <a href="mailto:hello@galaxyos.co" className="btn-hero-primary">
          Book a Demo
        </a>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge reveal">
            <span className="hero-badge-dot" />
            <span className="hero-badge-text">Now in Private Beta · Limited Access</span>
          </div>
          <h1 className="hero-h1 reveal reveal-delay-1" style={{ fontFamily: 'var(--font-head)' }}>
            Run Your Organization
            <br />
            From <span className="accent">Where Your Team</span>
            <br />
            Already Works.
          </h1>
          <p className="hero-sub reveal reveal-delay-2">
            Galaxy helps churches, NGOs, schools, associations, cooperatives, and communities stay
            organized, accountable, and productive — without changing how people communicate.
          </p>
          <div className="hero-actions reveal reveal-delay-3">
            <a href="mailto:hello@galaxyos.co" className="btn-hero-primary">
              Book a Demo
            </a>
            <a href="#waitlist" className="btn-hero-ghost">
              Join Waitlist
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 7H13M8 2L13 7L8 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
          <div className="hero-social-proof reveal reveal-delay-4">
            <div className="proof-avatars">
              <div className="proof-avatar">EA</div>
              <div className="proof-avatar">MO</div>
              <div className="proof-avatar">TC</div>
              <div className="proof-avatar">+</div>
            </div>
            <p className="proof-text">
              <strong>400+ organizations</strong> on the waitlist
            </p>
          </div>
        </div>

        <div className="hero-right">
          <div className="mission-control">
            <div className="mc-orbit" />
            <div className="mc-orbit mc-orbit-2" />
            <div className="mc-ring">
              <div className="mc-ring-inner" style={{ fontFamily: 'var(--font-head)' }}>
                G
              </div>
            </div>

            {/* Card: Tasks */}
            <div className="mc-card card-tasks">
              <div className="mc-card-label">Tasks Completed</div>
              <div className="mc-card-row">
                <div className="mc-card-value" style={{ fontFamily: 'var(--font-head)' }}>
                  247
                </div>
                <div className="mc-card-pill pill-green">↑ 18%</div>
              </div>
              <div className="mc-card-bar">
                <div className="mc-card-bar-fill" style={{ width: '78%' }} />
              </div>
              <div className="mc-card-sub">This month · 78% completion rate</div>
            </div>

            {/* Card: Attendance */}
            <div className="mc-card card-attend">
              <div className="mc-card-label">Attendance Tracked</div>
              <div className="mc-card-row">
                <div className="mc-card-value" style={{ fontFamily: 'var(--font-head)' }}>
                  94<span style={{ fontSize: '16px', color: 'var(--gm)' }}>%</span>
                </div>
                <div className="mc-card-pill pill-blue">Live</div>
              </div>
              <div className="mc-dots">
                <div className="mc-dot">EM</div>
                <div className="mc-dot">AO</div>
                <div className="mc-dot">BT</div>
              </div>
            </div>

            {/* Card: Approvals */}
            <div className="mc-card card-approval">
              <div className="mc-card-label">Pending Approvals</div>
              <div className="mc-card-value" style={{ fontFamily: 'var(--font-head)' }}>
                3
              </div>
              <div className="mc-card-sub" style={{ color: 'var(--gteal)' }}>
                ↓ 12 cleared today
              </div>
            </div>

            {/* Card: Activity */}
            <div className="mc-card card-activity">
              <div className="mc-card-label">Team Activity</div>
              <div className="activity-line">
                <div className="act-dot v" />
                <div className="act-text">Budget approved</div>
                <div className="act-time">2m</div>
              </div>
              <div className="activity-line">
                <div className="act-dot t" />
                <div className="act-text">Report submitted</div>
                <div className="act-time">11m</div>
              </div>
              <div className="activity-line">
                <div className="act-dot b" />
                <div className="act-text">Meeting scheduled</div>
                <div className="act-time">1h</div>
              </div>
            </div>

            {/* Card: Report */}
            <div className="mc-card card-report">
              <div className="mc-card-label">Monthly Report</div>
              <div className="mc-card-row">
                <div
                  className="mc-card-value"
                  style={{ fontFamily: 'var(--font-head)', fontSize: '18px' }}
                >
                  Ready
                </div>
                <div className="mc-card-pill pill-green">Auto</div>
              </div>
              <div className="mc-card-sub">Generated · 2 mins ago</div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST SECTION */}
      <section className="trust-section" id="customers">
        <div className="trust-label-row reveal">
          <div className="section-chip">Trusted By</div>
          <h2 className="trust-h2" style={{ fontFamily: 'var(--font-head)' }}>
            Organizations That Coordinate At Scale
          </h2>
          <p className="trust-sub">From 50-member community groups to 10,000-member institutions</p>
        </div>
        <div className="trust-metrics reveal">
          <div className="trust-metric">
            <Counter target={120} suffix="K+" />
            <div className="metric-label">Members Coordinated</div>
          </div>
          <div className="trust-metric">
            <Counter target={48} suffix="K+" />
            <div className="metric-label">Activities Managed</div>
          </div>
          <div className="trust-metric">
            <Counter target={400} suffix="+" />
            <div className="metric-label">Organizations Supported</div>
          </div>
          <div className="trust-metric">
            <Counter target={94} suffix="%" />
            <div className="metric-label">Member Satisfaction</div>
          </div>
        </div>
        <div className="trust-marquee-wrap">
          <div className="trust-marquee">
            {[
              { icon: '⛪', label: 'Churches & Faith Communities' },
              { icon: '🌍', label: 'International NGOs' },
              { icon: '🏫', label: 'Schools & Universities' },
              { icon: '🤝', label: 'Cooperative Societies' },
              { icon: '🏛️', label: 'Professional Associations' },
              { icon: '🌐', label: 'Community Networks' },
              { icon: '🏥', label: 'Health Organizations' },
              { icon: '✊', label: 'Civic Organizations' },
              { icon: '⛪', label: 'Churches & Faith Communities' },
              { icon: '🌍', label: 'International NGOs' },
              { icon: '🏫', label: 'Schools & Universities' },
              { icon: '🤝', label: 'Cooperative Societies' },
              { icon: '🏛️', label: 'Professional Associations' },
              { icon: '🌐', label: 'Community Networks' },
              { icon: '🏥', label: 'Health Organizations' },
              { icon: '✊', label: 'Civic Organizations' },
            ].map((org, i) => (
              <div className="trust-org-chip" key={i}>
                <span className="org-icon">{org.icon}</span> {org.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM SECTION */}
      <section className="problem-section" id="solutions">
        <div className="section-header reveal">
          <div className="section-chip">The Problem</div>
          <h2 className="section-h2" style={{ fontFamily: 'var(--font-head)' }}>
            Running An Organization
            <br />
            Shouldn&apos;t Feel This Hard.
          </h2>
          <p className="section-sub">
            Most organizations are managing complex operations with tools built for casual
            conversations.
          </p>
        </div>
        <div className="problem-grid">
          {[
            {
              icon: '🔕',
              color: 'pi-red',
              title: 'Decisions disappear in group chats',
              desc: 'Important agreements, approvals, and directives get buried under hundreds of unrelated messages. By tomorrow, no one remembers who decided what.',
            },
            {
              icon: '⏰',
              color: 'pi-amber',
              title: 'Follow-ups fall through the cracks',
              desc: 'Tasks get assigned in conversation and then forgotten. No system tracks who committed to what, or whether it was ever done.',
            },
            {
              icon: '📊',
              color: 'pi-violet',
              title: 'Reporting takes too much time',
              desc: 'Creating reports means chasing multiple people for updates, compiling scattered information, and hoping nothing was missed.',
            },
            {
              icon: '👁️',
              color: 'pi-red',
              title: 'Leaders lack visibility',
              desc: "Senior leaders have no real-time view of what's happening across teams. Oversight requires manual check-ins and status meetings.",
            },
            {
              icon: '📂',
              color: 'pi-amber',
              title: 'Records are impossible to find',
              desc: "When you need to reference a past decision, payment, or approval, you're scrolling through months of messages hoping to find it.",
            },
            {
              icon: '🔗',
              color: 'pi-violet',
              title: 'Coordination breaks at scale',
              desc: 'What works for 20 people collapses at 200. As organizations grow, informal systems become liabilities instead of assets.',
            },
          ].map((card, i) => (
            <div
              className={`problem-card reveal${i > 0 ? ` reveal-delay-${String((i % 3) + 1)}` : ''}`}
              key={i}
            >
              <div className={`problem-icon ${card.color}`}>{card.icon}</div>
              <div className="problem-title" style={{ fontFamily: 'var(--font-head)' }}>
                {card.title}
              </div>
              <div className="problem-desc">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW GALAXY HELPS */}
      <section className="how-section">
        <div className="how-inner">
          <div className="section-header centered reveal">
            <div className="section-chip">How Galaxy Helps</div>
            <h2 className="section-h2" style={{ fontFamily: 'var(--font-head)' }}>
              Three Steps.
              <br />
              Complete Transformation.
            </h2>
          </div>
          <div className="how-steps reveal">
            {[
              {
                num: '1',
                label: 'Step One',
                title: 'Keep Using The Tools Your Team Already Knows',
                desc: "No new apps. No retraining. No change in behavior. Galaxy works inside the communication channels your team is already using every day. The only thing that changes is what's possible.",
              },
              {
                num: '2',
                label: 'Step Two',
                title: 'Bring Structure To Everyday Operations',
                desc: 'Every message becomes a tracked action. Every approval is logged. Every task has an owner, a deadline, and a status. Accountability builds itself into the fabric of your organization.',
              },
              {
                num: '3',
                label: 'Step Three',
                title: 'Get Visibility Across Your Organization',
                desc: "Leaders see everything in real time. Automated reports. Instant dashboards. Complete records. You always know what's happening, what's overdue, and what needs your attention.",
              },
            ].map((step) => (
              <div className="how-step" key={step.num}>
                <div className="step-num">
                  <div className="step-num-circle">{step.num}</div>
                  {step.label}
                </div>
                <div className="step-title" style={{ fontFamily: 'var(--font-head)' }}>
                  {step.title}
                </div>
                <div className="step-desc">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENTO GALLERY */}
      <section className="bento-section" id="solutions">
        <div className="section-header centered reveal">
          <div className="section-chip">Built For Your Organization</div>
          <h2 className="section-h2" style={{ fontFamily: 'var(--font-head)' }}>
            Purpose-Built For
            <br />
            Every Organization Type
          </h2>
          <p className="section-sub" style={{ textAlign: 'center' }}>
            Galaxy adapts to the unique rhythms, governance needs, and coordination patterns of your
            organization.
          </p>
        </div>
        <div className="bento-grid reveal">
          <div className="bento-card span3 large">
            <div className="bento-card-bg">⛪</div>
            <div className="bento-tag">Churches</div>
            <div className="bento-title" style={{ fontFamily: 'var(--font-head)' }}>
              Coordinate Every Ministry With Confidence
            </div>
            <div className="bento-desc">
              Manage your congregation, track contributions, coordinate ministries, follow up with
              new members, and run pastoral operations — all with full visibility and
              accountability.
            </div>
          </div>
          <div className="bento-card span3 large">
            <div className="bento-card-bg">🌍</div>
            <div className="bento-tag">NGOs</div>
            <div className="bento-title" style={{ fontFamily: 'var(--font-head)' }}>
              Keep Field Teams Connected And Accountable
            </div>
            <div className="bento-desc">
              Coordinate distributed field operations, manage grant workflows, track beneficiary
              data, and report on impact without switching platforms or losing field staff
              productivity.
            </div>
          </div>
          <div className="bento-card span2">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🏫
            </div>
            <div className="bento-tag">Schools</div>
            <div className="bento-title" style={{ fontFamily: 'var(--font-head)' }}>
              Bring Staff, Parents &amp; Administration Together
            </div>
            <div className="bento-desc">
              Streamline communications between teachers, parents, and administration with
              structured workflows and accountable records.
            </div>
          </div>
          <div className="bento-card span2">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🤝
            </div>
            <div className="bento-tag">Associations</div>
            <div className="bento-title" style={{ fontFamily: 'var(--font-head)' }}>
              Manage Members Without The Administrative Burden
            </div>
            <div className="bento-desc">
              Handle dues, member records, meeting governance, and committee coordination with zero
              manual overhead.
            </div>
          </div>
          <div className="bento-card span2">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🌐
            </div>
            <div className="bento-tag">Communities</div>
            <div className="bento-title" style={{ fontFamily: 'var(--font-head)' }}>
              Turn Engagement Into Organized Action
            </div>
            <div className="bento-desc">
              Transform passive community members into active, coordinated participants with
              structured engagement and real accountability.
            </div>
          </div>
          <div className="bento-card span3">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🏦
            </div>
            <div className="bento-tag">Cooperatives</div>
            <div className="bento-title" style={{ fontFamily: 'var(--font-head)' }}>
              Track Participation, Approvals, And Activities
            </div>
            <div className="bento-desc">
              Member savings, loan approvals, dues tracking, and governance — structured, auditable,
              and accessible from any device. Full financial and operational accountability in one
              place.
            </div>
          </div>
        </div>
      </section>

      {/* OUTCOMES SECTION */}
      <section className="outcomes-section">
        <div className="outcomes-inner">
          <div className="section-header centered reveal">
            <div className="section-chip">What Changes</div>
            <h2 className="section-h2" style={{ fontFamily: 'var(--font-head)' }}>
              What Changes With Galaxy?
            </h2>
            <p className="section-sub" style={{ textAlign: 'center', margin: '0 auto' }}>
              The transformation happens immediately. Here&apos;s what organizations experience
              within the first 30 days.
            </p>
          </div>
          <div className="outcomes-grid reveal">
            {[
              {
                icon: '📉',
                title: 'Reduce Manual Follow-Up',
                desc: 'Galaxy automatically tracks commitments, sends reminders, and escalates overdue items. You stop chasing.',
              },
              {
                icon: '🎯',
                title: 'Improve Accountability',
                desc: 'Every action is logged with a timestamp, owner, and outcome. Nothing disappears. Everyone is responsible.',
              },
              {
                icon: '👁️',
                title: 'Increase Visibility',
                desc: 'Leaders get real-time dashboards showing the health of their entire operation at a glance.',
              },
              {
                icon: '⚡',
                title: 'Coordinate Faster',
                desc: 'Structured workflows replace ad-hoc coordination. Teams move faster because everyone knows their role.',
              },
              {
                icon: '🗄️',
                title: 'Keep Records Organized',
                desc: 'Every decision, approval, and activity is automatically documented and instantly searchable.',
              },
            ].map((item) => (
              <div className="outcome-item" key={item.title}>
                <div className="outcome-icon">{item.icon}</div>
                <div className="outcome-title" style={{ fontFamily: 'var(--font-head)' }}>
                  {item.title}
                </div>
                <div className="outcome-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials-section" id="testimonials">
        <div className="section-header centered reveal">
          <div className="section-chip">Customer Stories</div>
          <h2 className="section-h2" style={{ fontFamily: 'var(--font-head)' }}>
            Heard From The Organizations
            <br />
            That Use Galaxy
          </h2>
        </div>
        <div className="testimonials-grid">
          <div className="testi-card featured reveal">
            <span className="testi-quote-mark">&ldquo;</span>
            <p className="testi-text">
              We were managing 800 members across 12 different groups. Galaxy gave us one place
              where everything actually happens — and a level of accountability we never had before.
            </p>
            <div className="testi-author">
              <div className="testi-avatar" style={{ fontFamily: 'var(--font-head)' }}>
                EA
              </div>
              <div>
                <div className="testi-name">Pastor Emmanuel Adeyinka</div>
                <div className="testi-role">Senior Pastor · Covenant Chapel Lagos</div>
              </div>
              <span className="testi-org-badge">Church</span>
            </div>
          </div>
          <div className="testi-card reveal reveal-delay-1">
            <span className="testi-quote-mark">&ldquo;</span>
            <p className="testi-text">
              Our field teams are spread across three countries. For the first time, I know exactly
              what&apos;s happening on the ground without being there. The visibility is
              unprecedented.
            </p>
            <div className="testi-author">
              <div
                className="testi-avatar"
                style={{
                  background: 'linear-gradient(135deg,var(--gblue),var(--gteal))',
                  fontFamily: 'var(--font-head)',
                }}
              >
                MO
              </div>
              <div>
                <div className="testi-name">Mary Okonkwo</div>
                <div className="testi-role">Country Director · Greenfields Foundation</div>
              </div>
              <span className="testi-org-badge">NGO</span>
            </div>
          </div>
          <div className="testi-card reveal reveal-delay-2">
            <span className="testi-quote-mark">&ldquo;</span>
            <p className="testi-text">
              Reporting that used to take two days now takes twenty minutes. Our donors get
              accurate, timely updates and our board has complete confidence in our operations.
            </p>
            <div className="testi-author">
              <div
                className="testi-avatar"
                style={{
                  background: 'linear-gradient(135deg,var(--gteal),var(--gblue))',
                  fontFamily: 'var(--font-head)',
                }}
              >
                TC
              </div>
              <div>
                <div className="testi-name">Thomas Chen</div>
                <div className="testi-role">Executive Director · Community First Network</div>
              </div>
              <span className="testi-org-badge">Association</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section" id="faq">
        <div className="faq-inner">
          <div className="reveal">
            <div className="section-chip">Common Questions</div>
            <h3 className="faq-sidebar-title" style={{ fontFamily: 'var(--font-head)' }}>
              Your Questions,
              <br />
              <em style={{ fontStyle: 'italic', color: 'var(--gv2)' }}>Answered.</em>
            </h3>
            <p className="faq-sidebar-sub">
              Still have something we haven&apos;t covered? We&apos;d love to hear from you
              directly.
            </p>
            <a href="mailto:hello@galaxyos.co" className="faq-contact-link">
              Talk to our team →
            </a>
          </div>
          <div className="faq-list reveal">
            {faqs.map((faq, i) => (
              <FaqItem key={i} index={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="cta-section" id="waitlist">
        <div className="cta-bg" />
        <div className="cta-bg-grid" />
        <div className="cta-inner reveal">
          <div className="section-chip" style={{ margin: '0 auto 28px', display: 'inline-flex' }}>
            Early Access · Limited Spots
          </div>
          <h2 className="cta-h2" style={{ fontFamily: 'var(--font-head)' }}>
            Ready To Run Your Organization
            <br />
            <span className="accent">More Effectively?</span>
          </h2>
          <p className="cta-sub">
            Join forward-thinking organizations using Galaxy to stay organized, accountable, and
            productive — without disrupting how their teams communicate.
          </p>
          <div className="cta-actions">
            <a href="mailto:hello@galaxyos.co" className="btn-hero-primary">
              Book a Demo
            </a>
            <a href="#" onClick={scrollToWaitlist} className="btn-hero-ghost">
              Join Waitlist
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 7H13M8 2L13 7L8 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
          <div className="cta-form-group" style={{ marginTop: '40px' }}>
            <input
              type="email"
              className="cta-input"
              placeholder="your@organization.com"
              value={ctaEmail}
              onChange={(e) => {
                setCtaEmail(e.target.value);
              }}
              style={{ fontFamily: 'var(--font-body)' }}
            />
            <button
              className="btn-primary"
              style={{
                padding: '14px 28px',
                borderRadius: '100px',
                fontSize: '14px',
                fontFamily: 'var(--font-body)',
              }}
              onClick={handleCtaSubmit}
            >
              Get Early Access
            </button>
          </div>
          {ctaMsg && (
            <div
              style={{
                fontSize: '13px',
                marginTop: '12px',
                minHeight: '20px',
                color: ctaMsg.color,
              }}
            >
              {ctaMsg.text}
            </div>
          )}
          <p className="cta-note">
            No credit card required. Hands-on onboarding included for early access organizations.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-main">
          <div className="footer-brand">
            <a href="#" className="logo" style={{ fontFamily: 'var(--font-head)' }}>
              <div className="logo-mark">G</div>
              <span className="logo-name">Galaxy</span>
            </a>
            <p className="footer-brand-desc" style={{ marginTop: '16px' }}>
              The Operating System For Organizations. Built for churches, NGOs, schools,
              cooperatives, and communities.
            </p>
            <div className="footer-social">
              <a href="#" className="footer-social-btn" title="LinkedIn">
                in
              </a>
              <a href="#" className="footer-social-btn" title="X/Twitter">
                𝕏
              </a>
              <a href="mailto:hello@galaxyos.co" className="footer-social-btn" title="Email">
                @
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                Solutions
              </a>
              <a href="#" className="footer-link">
                Features
              </a>
              <a href="#" className="footer-link">
                Customer Stories
              </a>
              <a href="#" className="footer-link">
                Pricing
              </a>
              <a href="#" className="footer-link">
                FAQ
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Organization Types</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                Churches
              </a>
              <a href="#" className="footer-link">
                NGOs
              </a>
              <a href="#" className="footer-link">
                Schools
              </a>
              <a href="#" className="footer-link">
                Associations
              </a>
              <a href="#" className="footer-link">
                Cooperatives
              </a>
              <a href="#" className="footer-link">
                Communities
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                About Galaxy
              </a>
              <a href="mailto:hello@galaxyos.co" className="footer-link">
                Contact
              </a>
              <a href="#" className="footer-link">
                Careers
              </a>
              <a href="#" className="footer-link">
                Partners
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Resources</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                Blog
              </a>
              <a href="#" className="footer-link">
                Guides
              </a>
              <a href="#" className="footer-link">
                Help Center
              </a>
              <a href="#" className="footer-link">
                Privacy Policy
              </a>
              <a href="#" className="footer-link">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-left">
            © Galaxy 2026. All rights reserved. ·{' '}
            <a
              href="mailto:hello@galaxyos.co"
              style={{ color: 'var(--gm)', textDecoration: 'none' }}
            >
              hello@galaxyos.co
            </a>
          </div>
          <div className="footer-tagline" style={{ fontFamily: 'var(--font-head)' }}>
            The Operating System For Organizations.
          </div>
        </div>
      </footer>
    </div>
  );
}
