import "server-only";
import { createCareerMateMcpV2Handlers } from "@/lib/mcp-v2-handler";

const handlers = createCareerMateMcpV2Handlers();

export const POST = handlers.POST;
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
