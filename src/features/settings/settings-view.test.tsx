import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./settings-view";
import { CompanionAppearanceProvider } from "@/components/chat/companion-appearance-provider";

let mockParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockParams,
}));

const user = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  avatarDataUrl: null,
  role: "user",
};

function render(tab: string | null = null) {
  mockParams = tab ? new URLSearchParams({ tab }) : new URLSearchParams();
  return renderToStaticMarkup(
    <CompanionAppearanceProvider>
      <SettingsView user={user} refresh={vi.fn(async () => undefined)} setNotice={vi.fn()} />
    </CompanionAppearanceProvider>,
  );
}

beforeEach(() => {
  mockParams = new URLSearchParams();
});

describe("SettingsView", () => {
  it("renders the account tab by default with name, username and password fields", () => {
    const html = render();

    expect(html).toContain("账号信息");
    expect(html).toContain("显示名称");
    expect(html).toContain('aria-label="用户名"');
    expect(html).toContain("修改密码");
  });

  it("renders the companion appearance selector on the appearance tab", () => {
    const html = render("appearance");

    expect(html).toContain("AI 陪伴形象");
    expect(html).toContain("data-testid=\"companion-appearance-selector\"");
  });

  it("renders export and clear actions on the privacy tab", () => {
    const html = render("privacy");

    expect(html).toContain("导出 JSON");
    expect(html).toContain("CLEAR_MY_DATA");
    expect(html).toContain("清空成长数据");
  });
});
