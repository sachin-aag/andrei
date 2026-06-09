import { test as setup, expect } from "@playwright/test";

setup("seed auth users", async ({ request }) => {
  const res = await request.post("/api/test/seed-auth-users");
  expect(res.ok(), `seed-auth-users failed (${res.status()})`).toBeTruthy();
});
