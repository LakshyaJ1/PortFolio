import { getContributions } from "@/server/github";

// Daily contribution counts for the last year: { source, surveyedAt, total, days: [{ date, count }] }.
// GraphQL (token) → public mirror → committed snapshot; this never errors.
export async function GET() {
  const feed = await getContributions();
  return Response.json(feed);
}
