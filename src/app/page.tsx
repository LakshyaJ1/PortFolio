import { Collar } from "@/components/chrome/Collar";
import { About } from "@/components/sections/about/About";
import { Benchmarks } from "@/components/sections/benchmarks/Benchmarks";
import { Capabilities } from "@/components/sections/capabilities/Capabilities";
import { Hero } from "@/components/sections/hero/Hero";
import { Legend } from "@/components/sections/legend/Legend";
import { SurveyLog } from "@/components/sections/log/SurveyLog";
import { Rendezvous } from "@/components/sections/rendezvous/Rendezvous";
import { Sites } from "@/components/sections/sites/Sites";
import { Traverse } from "@/components/sections/traverse/Traverse";
import { Boundary } from "@/components/shell/Boundary";

// Same order as SECTIONS in @/lib/sections: booking sits right after the projects,
// so it's never more than a few screens away.
export default function Home() {
  return (
    <>
      <main id="main" tabIndex={-1}>
        <Boundary name="hero">
          <Hero />
        </Boundary>
        <Boundary name="about">
          <About />
        </Boundary>
        <Boundary name="capabilities">
          <Capabilities />
        </Boundary>
        <Boundary name="traverse">
          <Traverse />
        </Boundary>
        <Boundary name="sites">
          <Sites />
        </Boundary>
        <Boundary name="rendezvous">
          <Rendezvous />
        </Boundary>
        <Boundary name="legend">
          <Legend />
        </Boundary>
        <Boundary name="log">
          <SurveyLog />
        </Boundary>
        <Boundary name="benchmarks">
          <Benchmarks />
        </Boundary>
      </main>
      <Boundary name="collar">
        <Collar />
      </Boundary>
    </>
  );
}
