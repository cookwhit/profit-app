import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  if (!admin && topic !== "SHOP_REDACT") {
    // The admin context isn't available for all topics
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      // Clean up shop data when app is uninstalled
      if (session) {
        // You could delete shop-specific data here
        console.log(`App uninstalled from ${shop}`);
      }
      break;
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // Handle mandatory GDPR webhooks
      console.log(`Received ${topic} webhook for ${shop}`);
      break;
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
