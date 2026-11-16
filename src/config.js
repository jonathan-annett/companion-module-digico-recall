import { consoleSetup } from './network.js'

export const DEFAULTS = {
	host: '192.168.1.10',
	sendPort: 8001,
	recvPort: 8000,
	rate: 500,
	queryTimeout: 400,
	slotCount: 32,
	scriptCount: 8,
	nameSetCount: 4,
	learn: false,
	ipadEnabled: false,
	ipadHost: '192.168.1.20',
	ipadSendPort: 9000,
	ipadRecvPort: 9001,
	libraryFile: '',
	// Not shown in the settings form: the stored captures, scripts and name sets, as JSON.
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
		'next to "commands allowed" and choose the iPad command set (for example ipad_q3 on a Quantum 338).'
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
			label: 'Web page: setup help, captures, scripts and names',
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
		{ type: 'number', id: 'slotCount', label: 'Preset slots', width: 4, min: 1, max: 200, default: DEFAULTS.slotCount },
		{
			type: 'number',
			id: 'scriptCount',
			label: 'Script slots',
			width: 4,
			min: 1,
			max: 100,
			default: DEFAULTS.scriptCount,
		},
		{
			type: 'number',
			id: 'nameSetCount',
			label: 'Name sets',
			width: 4,
			min: 1,
			max: 50,
			default: DEFAULTS.nameSetCount,
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
			id: 'libraryFile',
			label: 'Also keep the library in this file (optional, full path to a .json file)',
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

/** 1..count as an array, for slot, script and name-set numbering. */
export function ids(count) {
	return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, i) => i + 1)
}
