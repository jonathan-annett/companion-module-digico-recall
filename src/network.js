import os from 'node:os'

const toInt = (ip) => ip.split('.').reduce((n, part) => ((n << 8) | (Number(part) & 255)) >>> 0, 0)
const isIPv4 = (ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip ?? '').trim())

/**
 * Which of this computer's addresses the console should be told to talk to: the one on
 * the same network as the console if there is one.
 * @param {string} consoleIp
 * @param {ReturnType<typeof os.networkInterfaces>} [interfaces]  for tests
 * @returns {{best: string, matched: boolean, all: string[]}}
 */
export function localAddressFor(consoleIp, interfaces = os.networkInterfaces()) {
	const candidates = []
	for (const list of Object.values(interfaces)) {
		for (const entry of list ?? []) {
			const v4 = entry.family === 'IPv4' || entry.family === 4
			if (v4 && !entry.internal && isIPv4(entry.address)) candidates.push(entry)
		}
	}
	const all = candidates.map((c) => c.address)
	if (isIPv4(consoleIp)) {
		const target = toInt(consoleIp.trim())
		const hit = candidates.find((c) => {
			if (!isIPv4(c.netmask)) return false
			const mask = toInt(c.netmask)
			return (toInt(c.address) & mask) >>> 0 === (target & mask) >>> 0
		})
		if (hit) return { best: hit.address, matched: true, all }
	}
	return { best: all[0] ?? '', matched: false, all }
}

/**
 * The row to enter on the console's External Control page for the current settings.
 * The console's "Send" is the port this module listens on, and its "Rcv" is the port
 * this module sends to.
 */
export function consoleSetup(config, interfaces) {
	const local = localAddressFor(config.host, interfaces)
	return {
		type: 'DiGiCo Pad',
		name: 'Companion',
		ip: local.best,
		ipMatched: local.matched,
		otherIps: local.all.filter((ip) => ip !== local.best),
		send: Number(config.recvPort),
		rcv: Number(config.sendPort),
		consoleIp: String(config.host ?? ''),
	}
}
