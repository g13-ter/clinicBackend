import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

const keyText = process.env.BACKUP_ENCRYPTION_KEY ?? "";
if (!/^[a-f0-9]{64}$/i.test(keyText)) {
  throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
}
if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");

const runDump = () => new Promise((resolve, reject) => {
  const child = spawn("mongodump", [`--uri=${process.env.MONGO_URI}`, "--archive", "--gzip"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.on("error", reject);
  child.on("exit", (code) => code === 0
    ? resolve(Buffer.concat(chunks))
    : reject(new Error(`mongodump exited with code ${code}`)));
});

const archive = await runDump();
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyText, "hex"), iv);
const encrypted = Buffer.concat([cipher.update(archive), cipher.final()]);
const tag = cipher.getAuthTag();
const output = Buffer.concat([Buffer.from("SCB1"), iv, tag, encrypted]);
const backupDirectory = path.resolve(process.env.BACKUP_DIR || "backups");
await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(backupDirectory, `clinic-${timestamp}.scb`);
await writeFile(outputPath, output);
console.log(`Encrypted backup created: ${outputPath} (${output.length} bytes)`);
