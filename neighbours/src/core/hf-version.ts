import { FRAMEWORK_VERSION } from "@adam0white/human-framework";
export const HF_VERSION = FRAMEWORK_VERSION;
export const HF_SOURCE = `HF ${FRAMEWORK_VERSION}`;
/** Retained records keep their actual historical policy version after migration. */
export const isHfSource = (source: unknown): source is string =>
	source === HF_SOURCE || source === "HF 2.2.1" || source === "HF 2.3.0";
