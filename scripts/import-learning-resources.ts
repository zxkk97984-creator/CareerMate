import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { getPrisma } from "@/lib/prisma";
import { readCsvFile } from "./lib/csv";
import { resourceList, validateResourceRecord } from "./lib/resource-import-validation";

const DEFAULT_FILE = "data/resources/learning-resources.csv";

function contentHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fail(message: string): never {
  console.error(`[resources] ${message}`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", default: DEFAULT_FILE },
      "dry-run": { type: "boolean", default: false },
      batch: { type: "string", default: `resources-${new Date().toISOString().slice(0, 10)}` },
    },
  });

  const file = values.file ?? DEFAULT_FILE;
  const dryRun = Boolean(values["dry-run"]);
  const batch = values.batch ?? "resources-manual";
  const { records } = readCsvFile(file);
  const errors: string[] = [];
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  const prisma = getPrisma();

  for (const [index, record] of records.entries()) {
    errors.push(...validateResourceRecord(record, index + 2, seen));
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[resources] ${error}`);
    fail(`校验失败，共 ${errors.length} 条，未写入数据库`);
  }

  for (const record of records) {
    const externalKey = record.externalKey.trim();
    const steps = resourceList(record.steps);
    const deliverables = resourceList(record.deliverables);
    const acceptanceCriteria = resourceList(record.acceptanceCriteria);
    const payload = {
      externalKey,
      title: record.title.trim(),
      type: record.type.trim(),
      roleKey: record.roleKey.trim(),
      abilityKey: record.abilityKey.trim(),
      stage: record.stage.trim() || "all",
      source: record.source.trim(),
      provider: record.provider?.trim() || null,
      difficulty: record.difficulty?.trim() || null,
      url: record.url?.trim() || null,
      estimatedHours: record.estimatedHours ? Number(record.estimatedHours) : null,
      description: record.description?.trim() || "",
      detail: record.detail?.trim() || "",
      steps: JSON.stringify(steps),
      deliverables: JSON.stringify(deliverables),
      acceptanceCriteria: JSON.stringify(acceptanceCriteria),
      verificationStatus: record.verificationStatus.trim(),
      lastVerifiedAt: record.lastVerifiedAt ? new Date(record.lastVerifiedAt) : null,
      validUntil: record.validUntil ? new Date(record.validUntil) : null,
      sourceFile: file,
      sourceBatch: batch,
      contentHash: contentHash({ ...record, steps, deliverables, acceptanceCriteria }),
      status: "active",
    };

    if (dryRun) {
      console.log(`[resources] dry-run ${externalKey}`);
      continue;
    }

    const existing = await prisma.resourceItem.findUnique({ where: { externalKey } });
    if (existing) {
      await prisma.resourceItem.update({ where: { externalKey }, data: payload });
      updated += 1;
    } else {
      await prisma.resourceItem.create({ data: payload });
      created += 1;
    }
  }

  console.log(JSON.stringify({ file, batch, dryRun, total: records.length, created, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
