import type { LoaderFunctionArgs } from '@remix-run/node';

export function loader(_args: LoaderFunctionArgs) {
  throw new Response(null, { status: 204 });
}

export default function CatchAll() {
  return null;
}
