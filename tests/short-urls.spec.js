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
    expect(resp1.ok()).toBe(true);
    expect(resp2.ok()).toBe(true);
    const data1 = await resp1.json();
    const data2 = await resp2.json();

    expect(data1.id).toBeTruthy();
    expect(data2.id).toBeTruthy();
    expect(data1.id).not.toBe(data2.id);
  });

  test("nonexistent short URL redirects with link_error", async ({ request }) => {
    const resp = await request.get(`${BASE}/s/ZZZZZZ`, {
      maxRedirects: 0,
    });
    expect(resp.status()).toBe(302);
    const location = resp.headers()["location"];
    expect(location).toBe("/?link_error=not_found");
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

  test("invalid short ID format redirects with link_error", async ({ request }) => {
    // Too long
    const resp1 = await request.get(`${BASE}/s/ABCDEFGHIJ`, { maxRedirects: 0 });
    expect(resp1.status()).toBe(302);
    expect(resp1.headers()["location"]).toBe("/?link_error=not_found");
    // Special characters
    const resp2 = await request.get(`${BASE}/s/ab-c_d`, { maxRedirects: 0 });
    expect(resp2.status()).toBe(302);
    // Too short
    const resp3 = await request.get(`${BASE}/s/ab`, { maxRedirects: 0 });
    expect(resp3.status()).toBe(302);
  });

  test("query_string with CR/LF is rejected", async ({ request }) => {
    const resp = await request.post(`${BASE}/s`, {
      data: { query_string: "service=test\r\nEvil-Header: injected" },
    });
    expect(resp.status()).toBe(400);
  });
});
