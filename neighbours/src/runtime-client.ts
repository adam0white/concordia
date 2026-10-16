import type { UiCommand, UiReply } from "./contracts";
export class RuntimeClient {
	private worker: Worker;
	constructor(onReply: (reply: UiReply) => void) {
		this.worker = new Worker(new URL("./runtime.worker.ts", import.meta.url), {
			type: "module",
		});
		this.worker.onmessage = (event: MessageEvent<UiReply>) =>
			onReply(event.data);
		this.worker.onerror = () =>
			onReply({
				type: "error",
				message:
					"The simulation worker stopped. Reload the page, then restore a saved town.",
			});
	}
	send(command: UiCommand) {
		this.worker.postMessage(command);
	}
	close() {
		this.worker.terminate();
	}
}
