import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 解析 node_modules/.bin 下的可执行文件路径。
 *
 * Windows 上 npm 生成的是 `prisma.cmd`，没有 `prisma.exe`：
 *   - 直接 spawn "npx"/"prisma" 在 Windows 抛 ENOENT（Linux/macOS 正常）；
 *   - 直接 spawn "prisma.cmd" 会在 Node 20+ 抛 EINVAL（安全策略不允许无 shell 执行 .cmd）。
 * 因此这里统一给出「命令字符串 + shell 模式」的执行方式。
 */
export function binPath(name: string): string {
  const directory = join(process.cwd(), "node_modules", ".bin");
  const candidates =
    process.platform === "win32" ? [`${name}.cmd`, `${name}.exe`, name] : [name];
  for (const candidate of candidates) {
    const full = join(directory, candidate);
    if (existsSync(full)) return full;
  }
  return join(directory, name);
}

/**
 * 跨平台执行 node_modules/.bin 下的 CLI。
 *
 * Windows 上必须走 shell 才能执行 .cmd；其他平台直接执行文件。参数始终通过数组
 * 传递，避免项目路径包含空格时被错误拆分。
 */
export function runBin(
  name: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; timeout?: number } = {},
): void {
  const executable = binPath(name);
  execFileSync(executable, args, {
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    shell: process.platform === "win32",
    stdio: "pipe",
    timeout: options.timeout ?? 60_000,
  });
}
