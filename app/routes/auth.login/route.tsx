import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/auth?${url.searchParams.toString()}`);
  }
  return json({ polarisTranslations: require("@shopify/polaris/locales/en.json") });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};

export default function LoginPage() {
  const { polarisTranslations } = useLoaderData<typeof loader>();

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        background: "white",
        borderRadius: "16px",
        padding: "48px",
        width: "100%",
        maxWidth: "440px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>⚡</div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Speed Optimizer
          </h1>
          <p style={{ color: "#666", marginTop: "8px", fontSize: "15px" }}>
            The WP-Rocket for Shopify
          </p>
        </div>
        <Form method="post">
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, color: "#333" }}>
              Shop domain
            </label>
            <input
              name="shop"
              placeholder="your-store.myshopify.com"
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Install App
          </button>
        </Form>
      </div>
    </div>
  );
}
