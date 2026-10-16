// Brand marks for the tools that have one, from Simple Icons (CC0; each mark stays its owner's
// trademark). Server-only: Legend.tsx reads this and hands the few path strings to the client, so
// the 5 MB icon module never reaches the browser. Named imports keep production builds tree-shaken.
// Skills without a usable brand mark (concepts, C#, Java, SQL, Azure, and MySQL, whose mark is a
// wordmark too small to read here) use the authored pictograms in Mark.tsx.

import {
  siCplusplus,
  siDocker,
  siGit,
  siJavascript,
  siLanggraph,
  siMongodb,
  siNodedotjs,
  siOpencv,
  siPython,
  siPytorch,
  siReact,
  siRos,
  siTensorflow,
  siUnity,
} from "simple-icons";

/** skill label (as written in SKILLS) → 24×24 filled path */
export const BRAND_PATHS: Record<string, string> = {
  LangGraph: siLanggraph.path,
  PyTorch: siPytorch.path,
  TensorFlow: siTensorflow.path,
  "C++": siCplusplus.path,
  Python: siPython.path,
  JavaScript: siJavascript.path,
  ROS2: siRos.path,
  "Unity (XR)": siUnity.path,
  OpenCV: siOpencv.path,
  "Node.js": siNodedotjs.path,
  React: siReact.path,
  Docker: siDocker.path,
  Git: siGit.path,
  MongoDB: siMongodb.path,
};
