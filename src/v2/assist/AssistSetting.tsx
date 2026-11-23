import { useEffect, useState } from "react";
import { SettingRow, Toggle } from "../components/Controls";
import { ASSIST_EVENT, loadPrefs, setAssistEnabled } from "./assistStore";

/** Turns the "need a hand?" prompts on or off. Chosen per browser; the assistant never acts, it only explains. */
export function AssistSetting() {
  const [on, setOn] = useState(() => loadPrefs().enabled);
  useEffect(() => {
    const sync = () => setOn(loadPrefs().enabled);
    window.addEventListener(ASSIST_EVENT, sync);
    return () => window.removeEventListener(ASSIST_EVENT, sync);
  }, []);
  return (
    <SettingRow
      title="Help when I seem stuck"
      description="A small prompt offers a walkthrough when a screen looks hard. It only explains and never changes anything. You can turn it off here."
    >
      <Toggle
        checked={on}
        label="Offer help when I seem stuck"
        onChange={(v) => {
          setOn(v);
          setAssistEnabled(v);
        }}
      />
    </SettingRow>
  );
}
