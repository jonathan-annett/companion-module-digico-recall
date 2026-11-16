# Design notes

Why the module is built the way it is. The development log at the end records decisions
in the order they were made.

## The link to the console

DiGiCo consoles offer two OSC-based external control types. "Other OSC" is one-way and
only carries what you map to it. The "DiGiCo Pad" type is what the iPad app uses: it is
two-way and reaches nearly every channel parameter. This module uses the iPad link.

How the iPad link behaves, as understood from the open-source work credited in the README:

- Addresses are `/<Section>/<number>/<parameter>`, for example
  `/Input_Channels/12/EQ/eq_gain_2`.
- Sending an address with a value sets it.
- Sending the address with `/?` appended and no arguments asks for the value. The console
  replies on the plain address.
- The console sends changes made on the surface to the iPad device unprompted.
- The console talks to a fixed IP and port, set on its External Control page, and accepts
  one iPad-type device.

DiGiCo does not publish this protocol. `tools/probe.mjs` exists so the address list can be
checked against any console or software version.

## Structure

```
src/main.js        entry point Companion loads
src/instance.js    the Companion instance: lifecycle, persistence, iPad relay
src/config.js      settings fields and defaults
src/actions.js     action definitions
src/feedbacks.js   feedback definitions and colours
src/variables.js   variable definitions and values
src/presets.js     ready-made buttons
src/http.js        web page JSON API
src/webui.js       the web page (one self-contained document)
src/engine.js      capture, recall, scripts, names; no Companion dependency
src/params.js      address list per channel type; scope of each address
src/audit.js       optional audit log: timestamped changes and events, CSV file
src/validate.js    shape checks for anything from the web page or an imported file
src/transport.js   paced UDP link
src/osc.js         OSC encoding and decoding
```

`engine.js` knows nothing about Companion, so it can be tested directly and reused by the
probe. `instance.js` takes the SDK base class as a parameter for the same reason: the tests
drive the real instance class with a stand-in base class.

## Decisions

**Own OSC code instead of a library.** The console sends address-only packets and some
meter data without a type-tag string, which general OSC libraries reject. The module needs
three types (float, int, string), so a small tolerant decoder is less risk than a
dependency. It never throws on bad input.

**Queries are pipelined, not one at a time.** A channel is 100 to 250 addresses. Asking
for one, waiting, then asking for the next would take many seconds if any go unanswered.
The module sends all the queries (paced), matches replies by address, and re-asks for
anything missing, twice. A full input capture takes well under a second on a healthy link.

**Values are stored exactly as read.** Each stored value keeps the OSC type tags and
arguments the console sent. Recall sends them back unchanged. The module never converts
units, so it cannot introduce rounding or scaling errors.

**Recall scopes are decided by address, not stored per value.** `scopeOf()` maps an
address to EQ, COMP, GATE and so on by its shape. That means learned addresses fall into a
sensible scope without extra bookkeeping, and the web page can group values the same way.

**Some things are never captured.** Phantom power, main/alt switching, the alt-input
preamp, and solo/listen states are left out of the address list. If it isn't captured it
can't be recalled by mistake. A test enforces this.

**One kind of slot, made of steps.** Everything stored is a slot, and a slot is a list of
steps: a channel, and the values to send to it. A step either follows the recall-scope
toggles when it is sent (a captured channel: all of it is stored, the operator chooses
what to put back) or is fixed and sent in full (a script step, a saved name). "Capture",
"script" and "names" are only labels that pick the slot's colour. This replaced separate
numbered lists of captures, scripts and name sets, each with its own buttons, actions and
settings. The operator's gesture is always the same: press a button to start building,
do it on the console, press a slot.

**Scripts copy values, so they cannot recurse.** Recording a script means pressing slots
while SCRIPT REC is lit. Each press is recalled live and the values actually sent, to the
channels they actually went to, are copied into the script as fixed steps. A script that
presses another script simply receives a copy of that script's steps. Nothing refers to
another slot by number, so there is no way to build a loop, and re-using or clearing a
slot never changes a script made from it. The cost is a larger library.

**Echo suppression.** The console echoes values written to it. Without care, a recall
would look like the operator touching that channel. Every address the module (or the
relayed iPad) writes or queries is remembered for 1.5 seconds and ignored for touch
detection.

**Persistence in the Companion config.** The library is saved as JSON in the connection's
configuration, so it is included in Companion exports and backups. Companion's settings
form does not carry unknown keys, so `configUpdated` re-attaches the library when the form
is saved. An optional file copy is offered for people who want to move libraries between
machines by hand.

**Pacing.** Outgoing messages are limited (default 500 a second) so a full-channel recall
is not one burst of UDP. The limit is a setting because the right number depends on the
console and network.

## Development log

### 2026-11-16: feasibility, first build, 0.1.0

- Confirmed the idea is workable: the iPad link is two-way OSC and existing open-source
  projects document its addresses and query form. Chose it over "Other OSC".
- Built the engine, transport and OSC code first, with the simulated console, before any
  Companion code.
- First test run: 13 of 14 passed. The failure was a real defect (a value lost to two
  consecutive dropped packets); fixed by a second retry. See Findings in TESTING.md.
- Added the recall target switch (original or last touched) because it turns a capture
  into a reusable preset at almost no cost.
- Added name capture, name sets, the NAME scope and the web page in response to requests
  during the build. The web page edits captures and scripts as well as names.
- Checked the web page in a browser; found and fixed the scope key clash.
- First package was built against module API 1.12. Bitfocus's current template uses API
  2.x, so the module was ported before release: default-export entry point, variable
  definitions as an object, new preset structure, `checkAllFeedbacks`. Pinned to
  `@companion-module/base ~2.0.4` with the node22 runtime.
- Split the single Companion file into config, actions, feedbacks, variables, presets and
  http, matching the template's layout.
- Moved the tests to Node's built-in runner and added the behaviour and SDK test files:
  39 tests in total.
- Not yet done: any run inside Companion, or against DiGiCo software or a console.

### 2026-11-16: first contact with the offline software, 0.1.1 in progress

- First import into Companion and first connection to the Quantum 338 offline software.
  Everything found is in the findings table in TESTING.md.
- Setup was the hard part (firewall, "Enable External Control", loading the iPad command
  set), so the web page gained a Setup tab that works out the values from the console's
  address, and the settings page shows the console's device row.
- The maintainer suggested saving names by tapping channels rather than all at once, then
  that captures themselves should work the same way. Both adopted: one consistent gesture
  (press the button, touch channels, press where it goes). A slot now holds a list of
  channels. The stored format changed, with conversion of 0.1.0 libraries on load.
- Because a fader move arrives as many messages, a channel already in the capture, or
  being read, is not read again.

### 2026-11-16: single slot type, 0.2.0

- At the maintainer's request, captures, scripts and name sets were merged into one kind
  of slot. The engine's stored model became a list of steps with a "fixed" flag; see the
  decisions above. The three sets of buttons, actions, feedbacks, variables and settings
  collapsed into one, with a "holds" feedback to colour slots by content.
- Scripts containing scripts needed no extra mechanism: recording already copies what is
  sent. A test records a script that includes itself and stores it over itself, then
  checks the number of messages sent is finite and exact.
- Libraries from 0.1.0 and the unreleased 0.1.1 builds are converted on load: captures
  become step lists, and scripts and name sets move into the first free slots.
- The breaking change to buttons and stored data is why this became 0.2.0 and not 0.1.1.

### 2026-11-16: audit log

- Added an optional audit trail. Design points: off by default; a burst of values on one
  address within 1.5 seconds is one entry with the first "from" and the last "to", so a
  fader move is a single line; "from" comes from the last value seen or read for that
  address; the module's own writes and the console's echoes of them are recorded as one
  event line, never as operator changes; meters are never logged. Memory holds the
  latest 5,000 entries; a folder setting adds one CSV file per day, written only once an
  entry's burst has ended.
- Structure: `src/audit.js` holds the log and the file writer; the engine reports changes
  and events to it.

### 2026-11-16: meter capture

- Level metering was requested. What is known: the iPad app shows meters, the address
  table lists per-channel meter addresses plus `/Meters/request`, `/Meters/values` and
  `/Meters/clear`, another project reports the offline software answers meter queries with
  no value, and an S-series project describes a subscribe-then-stream scheme. What is not
  known for SD and Quantum: whether meters are pushed or must be requested, the payload
  format, the rate and the units.
- So the first step is a diagnostic. For ten seconds it stores every datagram that looks
  meter-related (decoded, plus raw hex, with millisecond offsets) and counts everything
  else by address. The first 30% of the time it only listens, to show what arrives
  unasked; after that it polls the candidate meter addresses for the last touched channel
  and the first input, group and aux with `/?` queries. It deliberately sends no writes,
  so it does not try `/Meters/request`; that can be tested once the passive data is in.
