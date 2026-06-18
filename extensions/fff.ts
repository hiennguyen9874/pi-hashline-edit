import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFffTools } from "../src/fff";

export default function (pi: ExtensionAPI): void {
  registerFffTools(pi);
}
