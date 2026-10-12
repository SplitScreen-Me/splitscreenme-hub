/** Placeholder answer of a route handler that exists in the route map but is not built yet. */
export const notImplemented = () =>
  Response.json(
    { error: { code: 'not_implemented', message: 'Not implemented yet' } },
    { status: 501, headers: { 'Cache-Control': 'no-store' } },
  );
