import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Shopify OAuth entry point — handles /auth, /auth/callback, /auth/shopify/callback
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};
