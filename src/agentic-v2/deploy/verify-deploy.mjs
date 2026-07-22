#!/usr/bin/env node
/**
 * CareerMate MCP V2 部署验证脚本
 *
 * 用法:
 *   node src/agentic-v2/deploy/verify-deploy.mjs --url <URL> --token <TOKEN> [--origin <ORIGIN>]
 *
 * 验证项:
 *   1. 工具列表
 *   2. 令牌认证
 *   3. Origin 校验
 *   4. 请求大小限制
 *   5. 数据隔离
 */

const DEFAULT_ORIGIN = "https://b.tbox.cn";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { url: "", token: "", origin: DEFAULT_ORIGIN };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && i + 1 < args.length) result.url = args[++i];
    if (args[i] === "--token" && i + 1 < args.length) result.token = args[++i];
    if (args[i] === "--origin" && i + 1 < args.length) result.origin = args[++i];
  }
  if (!result.url || !result.token) {
    console.error("用法: node verify-deploy.mjs --url <URL> --token <TOKEN> [--origin <ORIGIN>]");
    process.exit(1);
  }
  return result;
}

async function apiCall(url, token, origin, body) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
  };
  if (origin) headers["Origin"] = origin;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: response.status, body: json };
}

async function run() {
  const config = parseArgs();
  const results = [];
  console.log(`🔍 验证 MCP V2 部署: ${config.url}\n`);

  // 1. 工具列表
  console.log("1/8 工具列表...");
  const toolsRes = await apiCall(config.url, config.token, config.origin, {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  });
  const toolsOk = toolsRes.status === 200 && toolsRes.body?.result?.tools;
  console.log(`   ${toolsOk ? "✅" : "❌"} 状态 ${toolsRes.status}, ${toolsRes.body?.result?.tools?.length ?? 0} 个工具`);
  results.push({ name: "工具列表", ok: toolsOk, detail: toolsRes.body?.result?.tools?.map(t => t.name) });

  // 2. 缺少令牌
  console.log("2/8 缺少令牌...");
  const noAuthRes = await apiCall(config.url, "", config.origin, {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  });
  const noAuthOk = noAuthRes.status === 401;
  console.log(`   ${noAuthOk ? "✅" : "❌"} 状态 ${noAuthRes.status} (预期 401)`);
  results.push({ name: "缺少令牌", ok: noAuthOk });

  // 3. 错误令牌
  console.log("3/8 错误令牌...");
  const badAuthRes = await apiCall(config.url, "INVALID_TOKEN_12345", config.origin, {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  });
  const badAuthOk = badAuthRes.status === 401;
  console.log(`   ${badAuthOk ? "✅" : "❌"} 状态 ${badAuthRes.status} (预期 401)`);
  results.push({ name: "错误令牌", ok: badAuthOk });

  // 4. 非法 Origin
  console.log("4/8 非法 Origin...");
  const badOriginRes = await apiCall(config.url, config.token, "https://evil.example.com", {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  });
  const badOriginOk = badOriginRes.status === 403;
  console.log(`   ${badOriginOk ? "✅" : "❌"} 状态 ${badOriginRes.status} (预期 403)`);
  results.push({ name: "非法 Origin", ok: badOriginOk });

  // 5. 无 Origin（服务端调用）
  console.log("5/8 无 Origin（服务端调用）...");
  const noOriginRes = await apiCall(config.url, config.token, null, {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  });
  const noOriginOk = noOriginRes.status === 200;
  console.log(`   ${noOriginOk ? "✅" : "❌"} 状态 ${noOriginRes.status} (预期 200，服务端调用跳过 Origin 检查)`);
  results.push({ name: "无 Origin", ok: noOriginOk });

  // 6. 请求大小限制
  console.log("6/8 请求大小限制...");
  const bigBody = "x".repeat(2 * 1024 * 1024); // 2MB > 1MB 限制
  const bigRes = await apiCall(config.url, config.token, config.origin, {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: { big: bigBody },
  });
  const bigOk = bigRes.status === 413;
  console.log(`   ${bigOk ? "✅" : "❌"} 状态 ${bigRes.status} (预期 413)`);
  results.push({ name: "请求大小限制", ok: bigOk });

  // 7. 不支持的方法
  console.log("7/8 GET 方法拒绝...");
  const getRes = await fetch(config.url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${config.token}` },
  });
  const getOk = getRes.status === 405;
  console.log(`   ${getOk ? "✅" : "❌"} 状态 ${getRes.status} (预期 405)`);
  results.push({ name: "GET 拒绝", ok: getOk });

  // 8. SSE 支持
  console.log("8/8 SSE 支持...");
  const sseRes = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "Authorization": `Bearer ${config.token}`,
      "Origin": config.origin,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const sseContentType = sseRes.headers.get("content-type") ?? "";
  const sseOk = sseRes.status === 200 && sseContentType.includes("text/event-stream");
  console.log(`   ${sseOk ? "✅" : "❌"} 状态 ${sseRes.status}, Content-Type: ${sseContentType}`);
  results.push({ name: "SSE 支持", ok: sseOk });

  // 汇总
  const passed = results.filter(r => r.ok).length;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📋 汇总: ${passed}/${results.length} 通过`);
  for (const r of results) {
    console.log(`   ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `: ${r.detail.join(", ")}` : ""}`);
  }

  if (passed === results.length) {
    console.log("\n🎉 全部验证通过！MCP V2 部署就绪。");
    process.exit(0);
  } else {
    console.log("\n❌ 部分验证失败，请检查部署配置。");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("验证脚本异常:", err.message);
  process.exit(1);
});
