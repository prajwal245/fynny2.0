import NeuralNetwork from "@/components/solutions/NeuralNetwork";

/**
 * ProductEcosystemSection
 * Homepage section that replaces the previous "What FYNHelp Does" suites section.
 * Reuses the Solutions page neural network so all hover states, animations,
 * responsive behavior and click handlers are preserved.
 *
 * Spacing rules:
 *  - Symmetric vertical padding on the outer wrapper (top = bottom) so the
 *    section breathes evenly into the next dark section.
 *  - Intro and trailing text use margin (not section padding) so the diagram
 *    sits visually centered within the section.
 *  - Responsive scale: tighter on mobile, roomier on desktop. No fixed gaps
 *    that could create empty bands at any breakpoint.
 */
export default function ProductEcosystemSection() {
  return (
    <section
      id="product-ecosystem"
      className="overflow-x-hidden py-12 sm:py-16 md:py-20 lg:py-24"
      style={{ background: "#FAFAF8" }}
    >
      {/* Intro */}
      <div className="text-center px-5 mb-8 sm:mb-10 md:mb-12">
        <h2
          className="text-[28px] sm:text-[32px] md:text-[38px] leading-[1.2] mb-3 sm:mb-4"
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontWeight: 700,
            color: "#1A1A1A",
          }}
        >
          How the product ecosystem works together
        </h2>
        <p
          className="text-[15px] sm:text-[16px] md:text-[17px]"
          style={{
            fontFamily: "'Roboto', sans-serif",
            color: "#1A1A1A",
            opacity: 0.75,
            margin: 0,
          }}
        >
          Hover over any module to see what's inside. Click to explore deeper.
        </p>
      </div>

      {/* Neural network diagram */}
      <div className="flex flex-col items-center w-full overflow-x-hidden">
        <div className="w-full flex justify-center">
          <NeuralNetwork />
        </div>
        <p
          className="text-[15px] sm:text-[16px] md:text-[18px] mt-8 sm:mt-10 md:mt-12 px-5 text-center"
          style={{
            fontFamily: "'Roboto', sans-serif",
            lineHeight: 1.6,
            color: "#1A1A1A",
            maxWidth: 820,
            marginBottom: 0,
          }}
        >
          Every module feeds CFO Fynny. CFO Fynny connects everything. You get one coherent answer, not 6 separate dashboards.
        </p>
      </div>

    </section>
  );
}
