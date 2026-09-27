/**
 * Single intelligence dashboard page — used for both /demo/* and /dashboard/*.
 * The mode prop switches the data source between seeded demo data and the
 * authenticated user's live data.
 */
import { Helmet } from "react-helmet-async";
import IntelligenceShell, { TabId } from "@/components/intelligence/IntelligenceShell";
import { IntelligenceProvider, IntelligenceMode } from "@/components/intelligence/DataSource";
import DetailDrawer from "@/components/dashboard/DetailDrawer";

interface Props {
  mode: IntelligenceMode;
  tab?: TabId;
}

export default function IntelligencePage({ mode, tab = "liquidity" }: Props) {
  const isDemo = mode === "demo";
  return (
    <IntelligenceProvider mode={mode}>
      {isDemo && (
        <Helmet>
          <title>FynHelp Demo — See AI CFO in Action</title>
          <meta name="description" content="Explore FynHelp's live demo. See liquidity intelligence, revenue tracking, GST compliance, and AI-powered financial insights for Indian businesses." />
          <link rel="canonical" href={`https://fynhelp.com/demo/${tab}`} />
          <meta property="og:title" content="FynHelp Demo — See AI CFO in Action" />
          <meta property="og:description" content="Live demo of FynHelp's AI CFO for Indian SMEs." />
          <meta property="og:url" content={`https://fynhelp.com/demo/${tab}`} />
          <meta name="robots" content="index, follow" />
        </Helmet>
      )}
      {!isDemo && (
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
      )}
      <div className="min-h-screen bg-fyn-beige">
        <IntelligenceShell initialTab={tab} />
        <DetailDrawer />
      </div>
    </IntelligenceProvider>
  );
}
