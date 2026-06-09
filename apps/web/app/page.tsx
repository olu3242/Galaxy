import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import TrustSection from '../components/landing/TrustSection';
import ChallengesSection from '../components/landing/ChallengesSection';
import HowItWorks from '../components/landing/HowItWorks';
import OrganizationGallery from '../components/landing/OrganizationGallery';
import OutcomesSection from '../components/landing/OutcomesSection';
import Testimonials from '../components/landing/Testimonials';
import FAQ from '../components/landing/FAQ';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';

export default function Home(): React.ReactElement {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustSection />
        <ChallengesSection />
        <HowItWorks />
        <OrganizationGallery />
        <OutcomesSection />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
