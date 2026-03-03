/**
 * Favicon Route
 * Handles favicon.ico requests to prevent 404 errors
 */

import { json } from '@remix-run/node';

export const loader = () => {
  // Return a simple 1x1 transparent PNG
  const favicon = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  return new Response(favicon, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
};
