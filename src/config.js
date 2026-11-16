import { consoleSetup } from './network.js'

export const DEFAULTS = {
	host: '192.168.1.10',
	sendPort: 8001,
	recvPort: 8000,
	rate: 500,
	queryTimeout: 400,
	slotCount: 32,
	learn: false,
	preFaderAuxes: '',
	ipadEnabled: false,
	ipadHost: '192.168.1.20',
	ipadSendPort: 9000,
	ipadRecvPort: 9001,
	libraryFile: '',
	audit: false,
	auditFolder: '',
	// Not shown in the settings form: the stored slots, as JSON.
	library: '',
}

const port = (id, label, def, extra = {}) => ({
	type: 'number',
	id,
	label,
	width: 6,
	min: 1,
	max: 65535,
	default: def,
	...extra,
})

/**
 * The console's External Devices row, laid out as on the console's External Control page
 * and filled in with what to enter there for the saved settings.
 */
function consoleRowFields(config) {
	const setup = consoleSetup(config)
	const cell = (id, label, value, width) => ({ type: 'static-text', id, label, value: String(value), width })
	const ip = setup.ip || 'this computer’s IP address'
	let note =
		'Set Enable External Control to YES, press "add device", and fill in the row as shown above. Then press "load" ' +
		'next to "commands allowed" and choose the iPad command set (for example ipad_q3 on a Quantum 338).' +
		' If the console stops answering, or after changing these settings, set Enable External Control to NO and back to YES.'
	if (setup.ip && !setup.ipMatched) {
		note += ` This computer has no address on the same network as ${setup.consoleIp || 'the console'}; ${setup.ip} is a guess.`
	}
	if (setup.otherIps.length) note += ` This computer's other addresses: ${setup.otherIps.join(', ')}.`
	note += ' Shown for the saved settings: save and reopen this page after changing the console address or ports.'
	return [
		cell('consoleHeading', 'On the console: Setup > External Control > External Devices', '', 12),
		cell('consoleType', 'Type', setup.type, 2),
		cell('consoleName', 'Name', setup.name, 2),
		cell('consoleIp', 'IP Address', ip, 3),
		cell('consoleSend', 'Send', setup.send, 2),
		cell('consoleRcv', 'Rcv', setup.rcv, 1),
		cell('consoleEnabled', 'Enabled', '✓', 2),
		cell('consoleNote', '', note, 12),
	]
}

/** Path of the module's web page on this Companion, for a given connection label. */
export function webPagePath(label) {
	return `/instance/${encodeURIComponent(label)}/`
}

export function getConfigFields(config = DEFAULTS, label = 'digico-recall') {
	const ipadOnly = { isVisibleExpression: '$(options:ipadEnabled)' }
	const path = webPagePath(label)
	return [
		{
			type: 'static-text',
			id: 'webPage',
			width: 12,
			label: 'Web page: setup help, slot editor and names',
			value:
				`<a href="${path}" target="_blank" rel="noopener"><b>Open the DiGiCo Recall web page</b></a>. ` +
				`It lives at this Companion's own address followed by <b>${path}</b> ` +
				`(for example http://127.0.0.1:8000${path}). Its Setup tab shows what to enter on the console.`,
		},
		...consoleRowFields({ ...DEFAULTS, ...config }),
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'One iPad-type device',
			value:
				'The console allows one iPad-type device. To keep using a real iPad as well, turn on the relay ' +
				'below and point the iPad app at this computer instead of the console.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Console IP address (the "Local ... IP" line at the bottom of the console\'s External Control page)',
			width: 12,
			default: DEFAULTS.host,
		},
		port('sendPort', 'Console receive port (module sends here)', DEFAULTS.sendPort),
		port('recvPort', 'Console send port (module listens here)', DEFAULTS.recvPort),
		{
			type: 'number',
			id: 'rate',
			label: 'Max messages per second to console',
			width: 6,
			min: 50,
			max: 5000,
			default: DEFAULTS.rate,
		},
		{
			type: 'number',
			id: 'queryTimeout',
			label: 'Wait for replies (ms)',
			width: 6,
			min: 50,
			max: 5000,
			default: DEFAULTS.queryTimeout,
		},
		{
			type: 'number',
			id: 'slotCount',
			label: 'Slots (each can hold a capture, a script or names)',
			width: 6,
			min: 1,
			max: 200,
			default: DEFAULTS.slotCount,
		},
		{
			type: 'checkbox',
			id: 'learn',
			label: 'Learn unknown parameters when they are touched (adds them to future captures)',
			width: 12,
			default: DEFAULTS.learn,
		},
		{
			type: 'textinput',
			id: 'preFaderAuxes',
			label:
				'Pre-fader auxes, for the UNITY key (for example 1-6, 9). Sends to these are raised or lowered to keep ' +
				'monitor mixes the same when UNITY changes a channel’s trim. The console does not report which sends are pre-fader.',
			width: 12,
			default: DEFAULTS.preFaderAuxes,
		},
		{
			type: 'textinput',
			id: 'libraryFile',
			label: 'Also keep the library in this file (optional, full path to a .json file)',
			width: 12,
			default: '',
		},
		{
			type: 'checkbox',
			id: 'audit',
			label: 'Audit log: start with it on (records every change the console reports, with the time)',
			width: 12,
			default: DEFAULTS.audit,
		},
		{
			type: 'textinput',
			id: 'auditFolder',
			label: 'Audit log: also write it to this folder, one CSV file per day (optional, full path)',
			width: 12,
			default: '',
		},
		{
			type: 'checkbox',
			id: 'ipadEnabled',
			label: 'Relay a real iPad through this module',
			width: 12,
			default: false,
		},
		{
			type: 'textinput',
			id: 'ipadHost',
			label: 'iPad IP address',
			width: 6,
			default: DEFAULTS.ipadHost,
			...ipadOnly,
		},
		port('ipadSendPort', 'iPad receive port (module sends here)', DEFAULTS.ipadSendPort, ipadOnly),
		port('ipadRecvPort', 'iPad send port (module listens here)', DEFAULTS.ipadRecvPort, ipadOnly),
	]
}

/** 1..count as an array, for slot numbering. */
export function ids(count) {
	return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, i) => i + 1)
}

/** "1-6, 9" as [1, 2, 3, 4, 5, 6, 9]. Anything that is not a number or a range is ignored. */
export function parseNumberList(text) {
	const out = new Set()
	for (const part of String(text ?? '').split(/[,;\s]+/)) {
		const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(part)
		if (!m) continue
		const from = Number(m[1])
		const to = Number(m[2] ?? m[1])
		for (let n = Math.min(from, to); n <= Math.max(from, to) && out.size < 200; n++) if (n >= 1) out.add(n)
	}
	return [...out].sort((a, b) => a - b)
}
