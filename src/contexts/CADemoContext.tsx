import { createContext, useContext } from "react";

export const DEMO_CA_FIRM_ID = "a0000000-ca00-deaf-0000-000000000001";

interface CADemoContextType {
  isDemoCA: boolean;
  demoFirmId: string;
}

export const CADemoContext = createContext<CADemoContextType>({
  isDemoCA: false,
  demoFirmId: DEMO_CA_FIRM_ID,
});

export const useCADemo = () => useContext(CADemoContext);
