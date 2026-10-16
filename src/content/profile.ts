// Single source of truth for everything the site says about Lakshya.
// Every fact and number here comes from the résumé (LakshyaCV.pdf). Do not add claims that aren't in it.

export type LatLng = { lat: number; lng: number };

export const PROFILE = {
  name: "Lakshya Jain",
  firstName: "Lakshya",
  role: "AI Engineer",
  /** what he can be hired as; the hero cycles through these (Lakshya's own wording, 2026-10-16) */
  roles: ["AI Engineer", "Software Development Engineer", "Full-stack developer", "3D web developer"],
  /** one line for teams and clients: what they can hire him to build */
  offer: "AI agents, full-stack products and 3D websites, built and shipped to production.",
  nameMeaning: "Lakshya (लक्ष्य) — Sanskrit for target, aim.",
  location: "Delhi, India",
  home: { lat: 28.6139, lng: 77.209 } satisfies LatLng,
  email: "10jainlakshya@gmail.com",
  // Phone is in the résumé but hidden by default (see QUESTIONS.md C1).
  phone: null as string | null,
  github: "https://github.com/LakshyaJ1",
  githubUser: "LakshyaJ1",
  linkedin: "https://www.linkedin.com/in/lakshya-jain-86b091292/",
  cal: "lakshyajain/30min",
  calUrl: "https://cal.com/lakshyajain/30min",
  resumePath: "/Lakshya-Jain-Resume.pdf",
  summary:
    "AI engineer building production agentic systems — human-in-the-loop LLM platforms, RAG pipelines and on-device models — with a background in robotics and extended reality.",
  status: "AI Engineer Intern at Hive Pro · B.Tech CSE (AI/ML), MAIT ’27",
} as const;

export type Experience = {
  id: string;
  org: string;
  orgNote?: string;
  role: string;
  start: string; // ISO yyyy-mm
  end: string | null; // null = present
  place: string;
  mode: "Remote" | "On-site";
  coords: LatLng;
  points: string[];
  stack: string[];
  link?: { label: string; href: string };
  nda?: boolean;
};

export const EXPERIENCE: Experience[] = [
  {
    id: "hivepro",
    org: "Hive Pro, Inc.",
    role: "AI Engineer Intern",
    start: "2026-06",
    end: null,
    place: "Dubai, United Arab Emirates",
    mode: "Remote",
    coords: { lat: 25.2048, lng: 55.2708 },
    points: [
      "Built and deployed production-grade AI platforms, including an ISMS portal, customer onboarding and sales outreach agentic platforms.",
      "Designed human-in-the-loop AI systems with approval workflows, RBAC, tenant isolation, and policy-based guardrails to ensure safe and controlled automation.",
      "Engineered LLM/agent pipelines integrating Claude, LangGraph, RAG, embeddings, and document processing, with external systems including HubSpot, Slack, Gmail, Fathom, and NATS.",
      "Hardened production systems through security and risk audits covering authentication, authorization, API protection, secret management, data isolation, AI grounding, concurrency, and automated testing.",
    ],
    stack: ["Claude", "LangGraph", "RAG", "Embeddings", "HubSpot", "Slack", "Gmail", "Fathom", "NATS"],
  },
  {
    id: "rainwire",
    org: "Rainwire Solutions Pvt. Ltd.",
    orgNote: "WARDEC – Indian Army",
    role: "AI Engineer Intern",
    start: "2026-01",
    end: "2026-05",
    place: "New Delhi",
    mode: "On-site",
    coords: { lat: 28.6139, lng: 77.209 },
    nda: true,
    points: [
      "Built a secure mobile application for military personnel (soldiers and brigadiers) under NDA.",
      "Fine-tuned an 8B-parameter LLM on in-house datasets for 3-way classification, achieving 88–92% accuracy.",
      "Developed a data acquisition pipeline using Playwright and Selenium, automating large-scale scraping and preprocessing.",
      "Built an AI-based deepfake detection pipeline for videos, images, text and URLs to detect manipulated media.",
      "Contributed to backend development and deployment of AI services on secure government infrastructure.",
    ],
    stack: ["LLM fine-tuning", "Playwright", "Selenium", "Deepfake detection"],
  },
  {
    id: "scrini",
    org: "Scrini AI Pvt. Ltd.",
    role: "AI Engineer Intern",
    start: "2025-12",
    end: "2026-02",
    place: "Remote",
    mode: "Remote",
    coords: { lat: 28.6139, lng: 77.209 },
    points: [
      "Architected an AI-powered resume search engine using Python, FastAPI, and Qdrant, enabling semantic matching across 10K+ candidate profiles with sub-50ms retrieval latency via HNSW indexing.",
      "Designed an asynchronous NLP pipeline with hybrid retrieval and cross-encoder reranking, combining vector similarity (cosine), metadata filtering, and deep semantic ranking for improved relevance.",
      "Deployed a scalable 3-tier microservices architecture (FastAPI backend, Streamlit UI, vector database) using Docker and Docker Compose, ensuring production-ready orchestration and modularity.",
    ],
    stack: ["Python", "FastAPI", "Qdrant", "HNSW", "Cross-encoders", "Streamlit", "Docker"],
  },
  {
    id: "iitd",
    org: "Indian Institute of Technology, Delhi",
    orgNote: "FSM Lab",
    role: "Extended Reality (XR) Intern",
    start: "2025-01",
    end: "2025-04",
    place: "New Delhi",
    mode: "On-site",
    coords: { lat: 28.545, lng: 77.1926 },
    points: [
      "Architected an interactive industrial training toolkit in Unity and C#, reducing employee onboarding time by 75%.",
      "Developed a real-time AI integration pipeline using Python Flask to sync voice commands with 3D CAD models.",
      "Engineered physics-accurate scripts, achieving 98% mechanical fidelity compared to physical hardware.",
    ],
    stack: ["Unity", "C#", "Python", "Flask", "CAD"],
    link: { label: "Watch the toolkit", href: "https://youtu.be/KJb_Zj6nslE" },
  },
  {
    id: "makers",
    org: "Maker’s Asylum",
    role: "Technical Mentor (VR, Robotics & AI)",
    start: "2025-04",
    end: null,
    place: "Remote",
    mode: "Remote",
    coords: { lat: 28.6139, lng: 77.209 },
    points: [
      "Mentored 250+ students in robotics hardware and computer vision; designed a scalable AI/ML curriculum for 3 cohorts.",
      "Empowered underserved students by conducting workshops on Arduino and AI technologies among 25+ participants.",
    ],
    stack: ["Computer Vision", "Arduino", "Robotics", "Teaching"],
  },
  {
    id: "atom",
    org: "A.T.O.M Robotics Lab",
    role: "Technical Team Member",
    start: "2024-10",
    end: null,
    place: "New Delhi",
    mode: "On-site",
    coords: { lat: 28.7196, lng: 77.0661 },
    points: [
      "Built an autonomous GPS navigation system for a Mars Rover prototype using ROS2 and Python.",
      "Implemented sensor fusion (LiDAR + IMU) for precise path planning and obstacle avoidance in Gazebo simulations.",
    ],
    stack: ["ROS2", "Python", "LiDAR", "IMU", "Gazebo"],
  },
];

export type Education = {
  id: string;
  school: string;
  detail: string;
  score: string;
  start: string;
  end: string;
  place: string;
  coords: LatLng;
};

export const EDUCATION: Education[] = [
  {
    id: "mait",
    school: "Maharaja Agrasen Institute of Technology",
    detail: "B.Tech in CSE (AI/ML)",
    score: "CGPA 9.0+", // as Lakshya asked (2026-10-16); the résumé PDF still reads 8.96, see QUESTIONS.md
    start: "2023",
    end: "2027",
    place: "New Delhi, India",
    coords: { lat: 28.7196, lng: 77.0661 },
  },
  {
    id: "sja",
    school: "St. Joseph’s Academy",
    detail: "Class 12th · Class 10th",
    score: "91.4% · 94.4%",
    start: "2020",
    end: "2023",
    place: "New Delhi, India",
    coords: { lat: 28.6139, lng: 77.209 },
  },
];

export type Project = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  stack: string[];
  points: string[];
  figures: { value: string; label: string }[];
  links: { label: string; href: string }[];
};

export const PROJECTS: Project[] = [
  {
    id: "setu",
    title: "SETU",
    subtitle: "GPS-denied egomotion tracking",
    category: "Android · Full stack · AI/ML",
    stack: ["C++20", "Kotlin", "Android", "PyTorch", "TensorFlow Lite", "Eigen", "GNSS/IMU", "RI-EKF", "MapLibre"],
    points: [
      "An offline navigation system for GNSS-denied environments, combining inertial sensing, road constraints, and map-based localization to bridge GPS outages.",
      "A Spectral Velocity Odometry (SVO) pipeline that extracts wheel-rotation frequencies from smartphone accelerometer vibrations to estimate vehicle speed without double-integrating acceleration.",
      "An on-device CNN-GRU velocity model trained on real vehicle recordings — 207 KB, 84,000+ parameters, 1–5 ms inference on mobile devices.",
      "A high-rate sensor pipeline processing real driving data at up to 227 Hz, with offline maps, continuous GNSS-to-dead-reckoning handover, and deterministic replay for validation.",
    ],
    figures: [
      { value: "207 KB", label: "on-device model" },
      { value: "1–5 ms", label: "inference" },
      { value: "227 Hz", label: "sensor pipeline" },
      { value: "84,000+", label: "parameters" },
    ],
    links: [{ label: "Website / APK", href: "https://setu-six-jet.vercel.app/" }],
  },
  {
    id: "amazon-ml",
    title: "Product Pricing Prediction",
    subtitle: "Amazon ML Challenge",
    category: "Multimodal ML",
    stack: ["Python", "PyTorch", "scikit-learn", "Pandas", "NumPy", "Transformers (BERT)", "LightGBM", "OpenCV"],
    points: [
      "A multimodal pricing pipeline processing 150,000+ products using text (BERT) and image (ResNet) embeddings.",
      "21.06% SMAPE by ensembling XGBoost and LightGBM models, outperforming baseline models by 15%.",
      "Top 20% placement on the global leaderboard.",
    ],
    figures: [
      { value: "Top 20%", label: "global leaderboard" },
      { value: "21.06%", label: "SMAPE" },
      { value: "150,000+", label: "products" },
      { value: "15%", label: "better than baseline" },
    ],
    links: [],
  },
  {
    id: "tokenforge",
    title: "TokenForge",
    subtitle: "Aptos blockchain launchpad",
    category: "Web3 · Full stack",
    stack: ["Next.js", "React", "Node.js", "Supabase", "Aptos", "Move"],
    points: [
      "A full-stack token launchpad with automated Move contract generation, locking 90% of supply in liquidity pools.",
      "Launched a coin named “Lakshyacoin” — real users bought it with the Petra wallet, with all coin details on the platform.",
    ],
    figures: [{ value: "90%", label: "supply locked in liquidity pools" }],
    links: [{ label: "Watch the demo", href: "https://youtu.be/sgqXnA14aEE" }],
  },
];

export type SkillGroup = { id: string; label: string; items: string[] };

export const SKILLS: SkillGroup[] = [
  { id: "ai", label: "AI / LLM", items: ["LLMs", "RAG", "LangGraph", "Agentic AI", "Gen AI", "Transformers", "Embeddings", "PyTorch", "TensorFlow"] },
  { id: "lang", label: "Languages", items: ["C++", "C#", "Python", "Java", "JavaScript", "SQL"] },
  { id: "tools", label: "Frameworks & tools", items: ["ROS2", "Unity (XR)", "OpenCV", "Node.js", "React", "Docker", "Git", "MongoDB", "MySQL"] },
  { id: "core", label: "Core concepts", items: ["Data Structures & Algorithms", "OOP", "Production ML", "Distributed Systems", "Cloud-native", "Azure"] },
  { id: "soft", label: "Ways of working", items: ["Rapid Prototyping", "Technical Mentorship", "Teaching", "Leadership", "Agile/Scrum", "Growth Mindset"] },
];

export type Achievement = { id: string; title: string; detail: string; figure?: string };

export const ACHIEVEMENTS: Achievement[] = [
  { id: "amazon", title: "Amazon ML Challenge", detail: "Top 20% on the global leaderboard", figure: "Top 20%" },
  { id: "quiz", title: "Winner", detail: "Computer Science Quiz at MeitY’s Digital India session" },
  { id: "microsoft", title: "Microsoft Gurgaon", detail: "Led a 10-member team in a drone workshop", figure: "10" },
  { id: "mentor", title: "Maker’s Asylum", detail: "Mentored 250+ students across 3 cohorts", figure: "250+" },
  { id: "marathon", title: "Vedanta Delhi Half Marathon 2024", detail: "Finisher, 15 km", figure: "15 km" },
  { id: "clubs", title: "Creativity", detail: "Member of WHATACLICK (photography), Keyara (fashion) and Finversion (finance)" },
];

export const GREETINGS: { word: string; lang: string; city: string; coords: LatLng }[] = [
  { word: "नमस्ते", lang: "Hindi", city: "Delhi", coords: { lat: 28.6139, lng: 77.209 } },
  { word: "Hello", lang: "English", city: "London", coords: { lat: 51.5072, lng: -0.1276 } },
  { word: "Hola", lang: "Spanish", city: "Madrid", coords: { lat: 40.4168, lng: -3.7038 } },
  { word: "Bonjour", lang: "French", city: "Paris", coords: { lat: 48.8566, lng: 2.3522 } },
  { word: "こんにちは", lang: "Japanese", city: "Tokyo", coords: { lat: 35.6762, lng: 139.6503 } },
  { word: "Ciao", lang: "Italian", city: "Rome", coords: { lat: 41.9028, lng: 12.4964 } },
  { word: "Olá", lang: "Portuguese", city: "Lisbon", coords: { lat: 38.7223, lng: -9.1393 } },
  { word: "안녕하세요", lang: "Korean", city: "Seoul", coords: { lat: 37.5665, lng: 126.978 } },
  { word: "Hallo", lang: "German", city: "Berlin", coords: { lat: 52.52, lng: 13.405 } },
  { word: "Merhaba", lang: "Turkish", city: "Istanbul", coords: { lat: 41.0082, lng: 28.9784 } },
  { word: "مرحبا", lang: "Arabic", city: "Dubai", coords: { lat: 25.2048, lng: 55.2708 } },
  { word: "你好", lang: "Mandarin", city: "Beijing", coords: { lat: 39.9042, lng: 116.4074 } },
];
