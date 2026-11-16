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

export function getConfigFields() {
	const ipadOnly = { isVisibleExpression: '$(options:ipadEnabled)' }
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Console setup',
			value:
				'On the console open Setup > External Control, enable it, and add this computer as a device of type ' +
				'"DiGiCo Pad" with the two ports below. The console allows one iPad-type device, so to keep using a ' +
				'real iPad as well, turn on the relay and point the iPad app at this computer instead of the console.',
		},
		{ type: 'textinput', id: 'host', label: 'Console IP address', width: 6, default: DEFAULTS.host },
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
