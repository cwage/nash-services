const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://api:5000";

test.describe("Short URL round-trip", () => {
  test("create and resolve a short URL preserving full query string", async ({ request }) => {
    const qs =
      "service=Metro_Nashville_Police_Department_Active_Dispatch_Table_view" +
      "&address=1000+Broadway%2C+Nashville%2C+TN&radius=2" +
      "&lat=36.15782&lng=-86.78445&z=13";

    // Create
    const createResp = await request.post(`${BASE}/s`, {
      data: { query_string: qs },
    });
    expect(createResp.ok()).toBe(true);
    const { id, url } = await createResp.json();
    expect(id).toBeTruthy();
    expect(url).toBe(`/s/${id}`);

    // Resolve — Playwright follows redirects, so fetch manually to check 302
    const resolveResp = await request.get(`${BASE}/s/${id}`, {
      maxRedirects: 0,
    });
    expect(resolveResp.status()).toBe(302);
    const location = resolveResp.headers()["location"];
    expect(location).toBe(`/?${qs}`);
  });

  test("two creates with same query string produce different IDs", async ({ request }) => {
    const qs = "service=test&address=somewhere";

    const resp1 = await request.post(`${BASE}/s`, { data: { query_string: qs } });
    const resp2 = await request.post(`${BASE}/s`, { data: { query_string: qs } });
    const data1 = await resp1.json();
    const data2 = await resp2.json();

    expect(data1.id).toBeTruthy();
    expect(data2.id).toBeTruthy();
    expect(data1.id).not.toBe(data2.id);
  });

  test("nonexistent short URL returns 404", async ({ request }) => {
    const resp = await request.get(`${BASE}/s/ZZZZZZ`, {
      maxRedirects: 0,
    });
    expect(resp.status()).toBe(404);
  });

  test("missing query_string returns 400", async ({ request }) => {
    const resp = await request.post(`${BASE}/s`, {
      data: {},
    });
    expect(resp.status()).toBe(400);
  });

  test("empty query_string returns 400", async ({ request }) => {
    const resp = await request.post(`${BASE}/s`, {
      data: { query_string: "   " },
    });
    expect(resp.status()).toBe(400);
  });

  test("query_string over 2000 chars returns 400", async ({ request }) => {
    const resp = await request.post(`${BASE}/s`, {
      data: { query_string: "x".repeat(2001) },
    });
    expect(resp.status()).toBe(400);
  });
});
