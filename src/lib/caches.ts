// Easter eggs: the hidden things on the site. Finding one logs it in the logbook.
// (Internal ids and type names still say "cache" so returning visitors keep their saved progress.)
// Hints are plain, direct instructions: the logbook shows every one of them openly.

export type CacheId =
  | "terminal"
  | "konami"
  | "target-lock"
  | "north-arrow"
  | "lakshyacoin"
  | "restricted"
  | "console"
  | "sleeper"
  | "poke"
  | "marathon"
  | "off-the-map"
  | "minimum";

export type CacheMeta = { id: CacheId; name: string; hint: string; reward: string };

export const CACHES: CacheMeta[] = [
  { id: "terminal", name: "Secret terminal", hint: "Press the ` key (just left of 1) to open the terminal. On a phone, use the terminal on the landing screen.", reward: "Opened the terminal" },
  { id: "konami", name: "Rover keys", hint: "On a keyboard, press ↑ ↑ ↓ ↓ ← → ← → B A (the Konami code) to start a rover game.", reward: "Unlocked the rover" },
  { id: "target-lock", name: "Target lock", hint: "Type lakshya anywhere on the page (not in a text box).", reward: "Locked onto the target" },
  { id: "north-arrow", name: "Magnetic north", hint: "Tap the compass arrow in the footer 5 times, quickly.", reward: "Spun the compass" },
  { id: "lakshyacoin", name: "Lakshyacoin", hint: "In the TokenForge project, tap the stray coin sitting at the end of the supply bar.", reward: "Found a Lakshyacoin" },
  { id: "restricted", name: "Restricted area", hint: "In Experience, knock 3 times on the hatched entry that is under NDA.", reward: "Knocked on the restricted area" },
  { id: "console", name: "Developer console", hint: "Open your browser's developer console (F12) and type lakshya.help().", reward: "Read the console" },
  { id: "sleeper", name: "Night watch", hint: "Don't touch or scroll anything for about 40 seconds and Bindu falls asleep.", reward: "Watched Bindu fall asleep" },
  { id: "poke", name: "Poke", hint: "Click Bindu 7 times fast, until she gets annoyed.", reward: "Annoyed Bindu" },
  { id: "marathon", name: "Half marathon", hint: "Scroll from the very top to the very bottom in under 25 seconds.", reward: "Ran the page end to end" },
  { id: "off-the-map", name: "Off the map", hint: "Visit a page that doesn't exist, for example add /nowhere to the address.", reward: "Went off the map" },
  { id: "minimum", name: "Global minimum", hint: "Drop a marble on the landing terrain and wait for it to settle at the lowest point.", reward: "Found the global minimum" },
];

export const cacheById = (id: CacheId) => CACHES.find((c) => c.id === id)!;
