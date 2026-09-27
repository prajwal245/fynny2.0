import { useScrollReveal } from "@/hooks/useScrollReveal";
import WaitlistForm from "@/components/WaitlistForm";

export default function FinalCTASection() {
  const ref = useScrollReveal();

  return (
    <section
      ref={ref}
      className="bg-fyn-red py-16 md:py-24 px-5 text-center"
    >
      <div className="max-w-[640px] mx-auto reveal-up">
        <h2
          className="font-display font-black text-white leading-[1.1] text-[32px] md:text-5xl lg:text-[56px]"
          style={{ fontFamily: "'Oswald', sans-serif" }}
        >
          Join the Waitlist Now
        </h2>

        <p className="text-white/90 text-lg md:text-xl mt-4 leading-relaxed">
          Be among the first 100 businesses to get 30 days FREE access to CFO Fynny
        </p>

        <div className="mt-8 text-left">
          <WaitlistForm variant="detailed" theme="dark" />
        </div>

        <p className="text-white font-medium text-base mt-5">
          (First 100 users get Pro Plan FREE for 30 days)
        </p>

        <p className="text-white/70 text-sm mt-2">
          No credit card required • Launch access May 2026
        </p>
      </div>
    </section>
  );
}
