import { FRAMEWORK_VERSION } from "@adam0white/human-framework";
export const HF_VERSION = FRAMEWORK_VERSION;
export const HF_SOURCE = `HF ${FRAMEWORK_VERSION}`;
/** Retained records keep their actual historical policy version after migration. */
export const isHfSource = (source: unknown): source is string =>
	source === HF_SOURCE ||
	source === "HF 2.2.1" ||
	source === "HF 2.3.0" ||
	source === "HF 2.6.0" ||
	source === "HF 2.8.0" ||
	source === "HF 2.18.0" ||
	source === "HF 2.21.0";
/** Save versions that load; HF restores older person records by their own engine stamp. */
export const LEGACY_HF_VERSIONS: readonly string[] = [
	"2.2.1",
	"2.3.0",
	"2.6.0",
	"2.8.0",
	"2.18.0",
	"2.21.0",
	HF_VERSION,
];
