import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

const backupPath = process.argv[2];
const keyText = process.env.BACKUP_ENCRYPTION_KEY ?? "";
if (!backupPath) throw new Error("Usage: npm run backup:verify -- <backup-file.scb>");
if (!/^[a-f0-9]{64}$/i.test(keyText)) {
  throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
}

const encrypted = await readFile(path.resolve(backupPath));
if (encrypted.subarray(0, 4).toString() !== "SCB1") throw new Error("Not a School Clinic encrypted backup");
const iv = encrypted.subarray(4, 16);
const tag = encrypted.subarray(16, 32);
const payload = encrypted.subarray(32);
const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyText, "hex"), iv);
decipher.setAuthTag(tag);
const archive = Buffer.concat([decipher.update(payload), decipher.final()]);
if (archive[0] !== 0x1f || archive[1] !== 0x8b) throw new Error("Decrypted backup is not a gzip archive");
console.log(`Backup verified successfully: ${path.resolve(backupPath)} (${archive.length} decrypted bytes)`);
