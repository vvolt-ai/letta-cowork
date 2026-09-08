import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const IDENTITY_VERSION = 1;
const ASSERTION_VERSION = "VERA-MASTER-V1";
const CHALLENGE_REQUEST_VERSION = "VERA-MASTER-CHALLENGE-V1";

export function masterIdentityPath(env = process.env) {
  return (
    env.VERA_MASTER_IDENTITY_PATH ||
    join(env.LETTA_HOME || join(homedir(), ".letta"), "vera", "master-identity.json")
  );
}

function fingerprint(publicKeyPem) {
  return createHash("sha256").update(publicKeyPem).digest("hex");
}

function generateIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    version: IDENTITY_VERSION,
    installationId: null,
    enrolledAgentId: null,
    assignmentId: null,
    assignmentRevision: null,
    serverUrl: null,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    publicKeyFingerprint: fingerprint(publicKey),
    enrolledAt: null,
  };
}

function normalizeIdentity(value) {
  if (!value || typeof value !== "object") return null;
  if (
    value.version !== IDENTITY_VERSION ||
    typeof value.publicKeyPem !== "string" ||
    typeof value.privateKeyPem !== "string"
  ) {
    return null;
  }
  const calculatedFingerprint = fingerprint(value.publicKeyPem);
  if (
    value.publicKeyFingerprint &&
    value.publicKeyFingerprint !== calculatedFingerprint
  ) {
    throw new Error("Vera Master Clio identity fingerprint does not match its public key");
  }
  return {
    version: IDENTITY_VERSION,
    installationId:
      typeof value.installationId === "string" ? value.installationId : null,
    enrolledAgentId:
      typeof value.enrolledAgentId === "string" ? value.enrolledAgentId : null,
    assignmentId:
      typeof value.assignmentId === "string" ? value.assignmentId : null,
    assignmentRevision:
      Number.isInteger(value.assignmentRevision) ? value.assignmentRevision : null,
    serverUrl: typeof value.serverUrl === "string" ? value.serverUrl : null,
    publicKeyPem: value.publicKeyPem,
    privateKeyPem: value.privateKeyPem,
    publicKeyFingerprint: calculatedFingerprint,
    enrolledAt: typeof value.enrolledAt === "string" ? value.enrolledAt : null,
  };
}

export async function readMasterIdentity(env = process.env) {
  const file = masterIdentityPath(env);
  try {
    const identity = normalizeIdentity(JSON.parse(await readFile(file, "utf8")));
    if (!identity) throw new Error(`Vera Master Clio identity is invalid: ${file}`);
    return identity;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw new Error(`Vera Master Clio identity is invalid JSON: ${file}`);
    }
    throw error;
  }
}

export async function writeMasterIdentity(identity, env = process.env) {
  const normalized = normalizeIdentity(identity);
  if (!normalized) throw new Error("Cannot save an invalid Vera Master Clio identity");
  const file = masterIdentityPath(env);
  const directory = dirname(file);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  try {
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporary, 0o600).catch(() => undefined);
    await rename(temporary, file);
    await chmod(file, 0o600).catch(() => undefined);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return normalized;
}

export async function ensureMasterIdentity(env = process.env) {
  return (await readMasterIdentity(env)) || writeMasterIdentity(generateIdentity(), env);
}

export async function saveMasterEnrollment(enrollment, env = process.env) {
  const identity = await ensureMasterIdentity(env);
  return writeMasterIdentity(
    {
      ...identity,
      installationId: enrollment.installationId,
      enrolledAgentId: enrollment.agentId,
      assignmentId: enrollment.assignmentId,
      assignmentRevision: enrollment.assignmentRevision,
      serverUrl: enrollment.serverUrl,
      enrolledAt: enrollment.enrolledAt || new Date().toISOString(),
    },
    env,
  );
}

export function bodySha256(body) {
  const serialized = body === undefined ? "" : JSON.stringify(body);
  return createHash("sha256").update(serialized).digest("hex");
}

export function createChallengeRequest(identity, input) {
  const request = {
    installationId: identity.installationId,
    agentId: input.agentId,
    timestamp: new Date().toISOString(),
    requestNonce: randomUUID(),
    method: input.method,
    path: input.path,
    bodySha256: input.bodySha256,
  };
  const payload = [
    CHALLENGE_REQUEST_VERSION,
    request.installationId,
    request.agentId,
    request.timestamp,
    request.requestNonce,
    request.method.toUpperCase(),
    request.path,
    request.bodySha256,
  ].join("\n");
  return {
    ...request,
    signature: sign(
      null,
      Buffer.from(payload, "utf8"),
      identity.privateKeyPem,
    ).toString("base64url"),
  };
}

export function masterAssertionPayload(assertion) {
  return [
    ASSERTION_VERSION,
    assertion.challengeId,
    assertion.nonce,
    assertion.installationId,
    assertion.agentId,
    assertion.timestamp,
    assertion.method.toUpperCase(),
    assertion.path,
    assertion.bodySha256,
  ].join("\n");
}

export function signMasterAssertion(identity, assertion) {
  if (!identity?.privateKeyPem) {
    throw new Error("Vera Master Clio signing identity is unavailable");
  }
  return sign(
    null,
    Buffer.from(masterAssertionPayload(assertion), "utf8"),
    identity.privateKeyPem,
  ).toString("base64url");
}

export function runtimeAgentId(context) {
  const agentId = context?.agent?.id;
  if (typeof agentId !== "string" || !agentId.trim()) {
    throw new Error("This Letta Code host did not provide a runtime agent ID");
  }
  return agentId.trim();
}
