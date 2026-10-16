import type { Metadata } from "next";
import { OffTheMap } from "@/components/eggs/notfound/OffTheMap";

export const metadata: Metadata = {
  title: "Off the map",
  description: "This grid square was never surveyed.",
};

// Server component shell; the survey sheet, the snake and the geocache live in the client island.
export default function NotFound() {
  return <OffTheMap />;
}
