import { getCommits } from "@/server/github";

// Latest public commits by LakshyaJ1: { source, surveyedAt, commits: [{ sha, repo, url, message, date }] × 12 }.
// The cached helpers in @/server/github own the network and the fallback chain; this never errors.
export async function GET() {
  const feed = await getCommits();
  return Response.json(feed);
}
