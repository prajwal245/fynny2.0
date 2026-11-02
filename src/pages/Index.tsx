import HomePage from "./HomePage";
import type { PressEntry } from "@/lib/press";

const Index = ({ press = [] }: { press?: PressEntry[] }) => <HomePage press={press} />;

export default Index;
