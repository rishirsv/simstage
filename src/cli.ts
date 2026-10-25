import { parseArgs } from "node:util";

export function serverOptions(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const { values } = parseArgs({ args, options: {
    preview: { type: "boolean", default: false }, workspace: { type: "string" },
    device: { type: "string" }, label: { type: "string" }, port: { type: "string" },
  }, strict: true, allowPositionals: false });
  if (!values.preview && (values.workspace !== undefined || values.device !== undefined || values.label !== undefined || values.port !== undefined)) throw new Error("Preview options require --preview.");
  if (!values.workspace && (values.device !== undefined || values.label !== undefined)) throw new Error("--device and --label require an explicit --workspace directory.");
  if (values.workspace !== undefined && !values.workspace.trim()) throw new Error("Workspace cannot be empty.");
  if (values.device !== undefined && (!values.device.trim() || values.device.length > 200)) throw new Error("Device must be an ID from sim_stage_status.");
  const rawPort = values.port ?? env.SIM_STAGE_PREVIEW_PORT ?? "0";
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) throw new Error("Preview port must be an integer between 0 and 65535.");
  return { preview: values.preview, workspacePath: values.workspace, deviceId: values.device, label: values.label, port: Number(rawPort) };
}
