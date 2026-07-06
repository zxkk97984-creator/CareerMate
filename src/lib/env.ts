import type { TboxMode } from "@/lib/types";

function read(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function getTboxConfig() {
  const mode = read("TBOX_MODE", "mock") as TboxMode;
  return {
    mode: ["api", "manual", "mock"].includes(mode) ? mode : "mock",
    apiKey: read("TBOX_API_KEY"),
    appId: read("TBOX_APP_ID"),
    agentId: read("TBOX_AGENT_ID"),
    chatEndpoint: read("TBOX_CHAT_ENDPOINT", "https://o.tbox.cn/openapi/v1/chat/create"),
    retrieveEndpoint: read("TBOX_RETRIEVE_ENDPOINT", "https://api.tbox.cn/api/datasets/retrieve"),
    streamTimeoutMs: Number(read("TBOX_STREAM_TIMEOUT_MS", "90000")),
    webServiceUrl: read("TBOX_WEB_SERVICE_URL"),
    datasetIds: {
      roleCompetency: read("TBOX_DATASET_ROLE_COMPETENCY"),
      learningResources: read("TBOX_DATASET_LEARNING_RESOURCES"),
      simulationScenes: read("TBOX_DATASET_SIMULATION_SCENES"),
      ethicsRules: read("TBOX_DATASET_ETHICS_RULES"),
    },
  };
}

export function getPluginToken() {
  return read("CAREERMATE_PLUGIN_TOKEN");
}
