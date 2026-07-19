import { createServerFn } from "@tanstack/react-start";

export const getClerkPublishableKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.CLERK_PUBLISHABLE_KEY;
  if (!key) throw new Error("CLERK_PUBLISHABLE_KEY not configured on the server");
  return { publishableKey: key };
});
