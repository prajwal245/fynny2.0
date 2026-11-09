// Entry file for the packaged Windows program (see .github/workflows/connector-exe.yml).
import { main } from "../public/downloads/fynhelp-tally-connector.mjs";
main().catch((e) => {
  console.error(e?.message ?? e);
  process.exitCode = 1;
});
