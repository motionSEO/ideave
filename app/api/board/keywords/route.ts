export async function POST(request: Request) {
  const body = (await request.json()) as { texts?: string[] };
  const texts = body.texts ?? [];

  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of text.split(" ")) {
      if (!token) {
        continue;
      }
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  const keywords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return Response.json({ keywords });
}
