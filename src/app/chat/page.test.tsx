import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import ChatPage from "./page";

describe("/chat compat redirect", () => {
  it("redirects to /dashboard instead of mounting a standalone chat page", () => {
    ChatPage();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
