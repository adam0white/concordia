import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

function gathering(company = false) {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	r.actor("ada").place = "hall";
	r.actor("lea").place = "hall";
	for (const id of r.prepareRound())
		r.apply(
			id,
			id === "ada" ? "gather" : company && id === "lea" ? "talk" : "rest",
		);
	return r;
}

it("rejects a contact receipt naming somebody else's active event", () => {
	const r = gathering();
	r.prepareRound();
	const ada = r.actor("ada"),
		musa = r.actor("musa");
	if (!ada.job || !musa.job) throw Error("Missing jobs");
	ada.job.socialContacts = [{ otherId: "lea", event: musa.job.event }];
	expect(() => restoreRuntime(r.export())).toThrow(
		"Invalid social contact receipt",
	);
});

it("rejects a contact receipt for the claimed partner's non-social activity", () => {
	const r = gathering();
	r.prepareRound();
	const ada = r.actor("ada"),
		lea = r.actor("lea");
	if (!ada.job || !lea.job) throw Error("Missing jobs");
	ada.job.socialContacts = [{ otherId: "lea", event: lea.job.event }];
	expect(() => restoreRuntime(r.export())).toThrow(
		"Invalid social contact receipt",
	);
});

it("rejects a one-sided receipt while both physical social jobs remain active", () => {
	const r = gathering(true);
	r.prepareRound();
	const lea = r.actor("lea");
	if (!lea.job?.socialContacts?.length) throw Error("Missing real contact");
	lea.job.socialContacts = [];
	expect(() => restoreRuntime(r.export())).toThrow(
		"Invalid social contact receipt",
	);
});

it("restores a real receipt after its completed counterpart leaves the event feed", () => {
	const r = gathering(true);
	for (let round = 0; round < 2; round++)
		for (const id of r.prepareRound())
			r.apply(id, r.actor(id).job?.offer.id ?? "rest");
	const save = r.export() as Save;
	const ada = save.people.find((p) => p.person.id === "ada");
	const contact = ada?.job?.socialContacts?.[0];
	if (!contact) throw Error("Missing historical contact");
	save.events = save.events.filter((e) => e.id !== contact.event);
	expect(() => restoreRuntime(save)).not.toThrow();
	const restored = restoreRuntime(save);
	for (const id of restored.prepareRound())
		restored.apply(id, (restored as Runtime).actor(id).job?.offer.id ?? "rest");
	expect((restored.export() as Save).consumed).toBe(1);
});
