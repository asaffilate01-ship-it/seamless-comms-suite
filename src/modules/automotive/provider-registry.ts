import { automotiveSources } from "./source-catalogue";

export function providerStatus(env: NodeJS.ProcessEnv = process.env) {
  return automotiveSources.map((source) => {
    const configured = source.credentialEnv ? Boolean(env[source.credentialEnv]) : source.status === "public-api" || source.id === "internal-evidence";
    return {
      id: source.id,
      name: source.name,
      region: source.region,
      access: source.status,
      capabilities: source.capabilities,
      preferredFor: source.preferredFor,
      configured,
      credentialRequired: Boolean(source.credentialEnv) && !configured,
      notes: source.notes,
    };
  });
}
