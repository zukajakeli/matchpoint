import { describe, it, expect } from "vitest";
import { GET, POST, buildReturnLocation, safeTarget } from "../../api/flitt-return.js";

describe("flitt-return", () => {
  it("turns Flitt's form POST into a GET redirect with the order id", () => {
    expect(buildReturnLocation({ to: "/book/success" }, { order_id: "abc-123", order_status: "approved" }))
      .toBe("/book/success?order_id=abc-123");
  });

  it("reads url-encoded and JSON bodies", () => {
    expect(buildReturnLocation({ to: "/book/success" }, "order_id=xyz&order_status=approved"))
      .toBe("/book/success?order_id=xyz");
    expect(buildReturnLocation({ to: "/book/success" }, '{"response":{"order_id":"j1"}}'))
      .toBe("/book/success?order_id=j1");
  });

  it("keeps existing query params (event pages)", () => {
    expect(buildReturnLocation({ to: "/events/42?registered=true" }, { order_id: "o1" }))
      .toBe("/events/42?registered=true&order_id=o1");
  });

  it("works without a body (plain GET)", () => {
    expect(buildReturnLocation({ to: "/book/cancelled" }, undefined)).toBe("/book/cancelled");
  });

  it("never redirects off-site", () => {
    expect(safeTarget("https://evil.example")).toBe("/");
    expect(safeTarget("//evil.example")).toBe("/");
    expect(safeTarget("/\\evil.example")).toBe("/");
    expect(buildReturnLocation({ to: "//evil.example/x" }, {})).toBe("/");
  });

  it("answers Flitt's form POST with a 303 to the page", async () => {
    const response = await POST(
      new Request("https://www.matchpoint.ge/api/flitt-return?to=%2Fbook%2Fsuccess", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "order_id=p9&order_status=approved&signature=abc",
      })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/book/success?order_id=p9");
  });

  it("also works for a plain GET", () => {
    const response = GET(new Request("https://www.matchpoint.ge/api/flitt-return?to=%2Fbook%2Fcancelled"));
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/book/cancelled");
  });
});
