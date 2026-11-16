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
- Maintainer's suggestion: snoop on a real iPad through the relay. When the relay is on,
  the capture sends no queries and stores every datagram in both directions, with a
  summary of what the iPad asked for. That should reveal the meter request the app makes
  without the module having to guess at a write. The relay itself is still untested with a
  real iPad.

### 2026-11-16: checked against the console's own command set

- The maintainer supplied `IPAD_Q3.DOSC`, the Quantum 338 iPad command set from the
  offline software (title "DiGiCo OSC Commands 1012", 815 commands). It is a binary file:
  one record per command with a section number, a block number, a value type (switch,
  number, meter, text), minimum and maximum, and a label such as "eq gain 2". It does not
  contain OSC addresses as text; section and block are numbers. The address a label maps
  to is the block's name plus the label with spaces as underscores, which matches every
  address already known from other sources.
- Result for Quantum 338: inputs have a four-band EQ and filters; aux, group and matrix
  have an eight-band EQ (first four dynamic), a pre/post-insert switch and no filters;
  the graphic EQ has 32 bands and a trim. The module's table was corrected to match and
  `tools/check-dosc.mjs` now reports no address outside the list.
- Meters: the set lists meter-type entries on every channel (pre, post, fader, gain
  reduction, gate, output) and, globally, only `/Meters/values` and `/Meters/clear`. There
  is no `/Meters/request` in this set, so the request mechanism is still unknown; the
  iPad snoop is the way to find it.
- Not captured, on purpose, though the console lists them: phantom (including on
  inserts), main/alt, alt-input preamp, stereo mode, input type, solo and listen states,
  control group membership, bus solo and sends-on-faders modes, surround pan.
- DiGiCo's file is not included in the repository. The check can be repeated with
  `node tools/check-dosc.mjs <file>`. The SD-range command sets were done later the same
  day; see below.

### 2026-11-16: first real traffic, and gangs

- First data from DiGiCo software: an audit log CSV from the Quantum 338 offline software.
  It shows that the console announces graphic EQ band moves to the iPad-type device, that
  `/Graphic_EQ/<n>/geq_gain_<band>` is the right address, that values are in dB, and that
  the module's name lookup works ("GEQ 9" became "GEQ 9 PC 1 L" after the first touch). A
  move arrives as about twenty messages, which the log merges into one line.
- It also shows ganging. Moving one band of a ganged pair (GEQ 9 and 10) produced the same
  control on both, 0 to 1 ms apart, every time. The maintainer pointed out that ganged
  graphics with different curves do not hold equal values; they track from where each was.
- Detection rule built from that: two channels of the same kind reporting the same control
  within 5 ms, having moved by the same amount (or, for text and first reports, holding
  the same value), three times within three seconds, are ganged. A member that reports
  three times in a row without its partner following within 80 ms is un-ganged; a single
  miss is forgiven in case the partner is pinned at the end of its range. A snapshot
  recall that happens to move two channels identically could create a false pair; it is
  dropped as soon as one of them is moved alone.
- Use: display, and sending a "last touched" recall to every member. Unknown and to be
  tested (M28): whether the console itself applies a value written to one ganged member
  to the other. If it applies the same movement to the partner, writing absolute values
  to both members in turn would not land both on the preset unless their curves already
  matched, and the recall would need to change (for example, write only one member).

### 2026-11-16: the SD-range command sets, 0.2.3

- The maintainer supplied seven files from the SD9, SD10 and SD11 offline software. Four
  are distinct: `IPAD_SD5-SD7-SD10` and `IPAD_SD8-SD9-SD11` (title "DiGiCo OSC Commands
  686") and their "V2" versions `IPADV2sd5-7-10` and `IPADV2sd8-9-11-12` (title "...
  1502"). The Quantum file is "... 1012".
- The 686 files number the sections differently (aux 3, group 4, matrix 14, graphic EQ
  15, control groups under 8) but, once that is allowed for, list exactly the same
  addresses as the V2 file for the same consoles. So old or V2, loaded on the console,
  makes no difference to this module.
- `IPADV2sd5-7-10` has the same channel addresses as Quantum 338, plus four "samples"
  entries of unknown purpose.
- SD8/9/11/12 differ from that only on busses: 25 fewer EQ addresses per bus (bands 5 to
  8 and the pre/post-insert switch) and 4 more (bus filters). The four dynamic EQ bands
  are listed on both.
- Decision: no console-type setting. A setting can be wrong, and a session moved from an
  SD9 to an SD10 would need it changed. Instead the table lists both forms and the engine
  drops, per section, any address unanswered in two captures in which most of the channel
  did answer; a channel that does not exist teaches nothing. The list is forgotten when
  the console reconnects. Cost: about a second on each of the first two bus captures.
- Assumption not yet tested on SD software: a console silently ignores a query for an
  address it does not have. To be watched for in the audit log on the first SD session,
  and on Quantum, where the four bus filter addresses are now asked for twice.
- Recalling a capture made on one family to the other sends the settings the target does
  not have as well; those are expected to be ignored for the same reason.
- Every set also lists, outside the channels, snapshot control, session name, console
  presets ("New Preset", "Recall Scope") and macro buttons. Not used here; noted for the
  proxy's sniffer and for later tools.

### 2026-11-16: what a recall does to a gang, 0.2.4

- The maintainer ran M28. Three behaviours are now known for a ganged pair of graphics:
  a move on the surface moves both by the same amount; a console preset changes only the
  side it is applied to; a value written over the iPad link behaves like a surface move.
- Consequence: over this link the difference between ganged members is fixed. Writing A
  to its recalled values shifts B by the same steps; writing B afterwards shifts A away
  again by however much the sides differed. No order of writes makes two differing sides
  equal.
- Decision: one write per gang per recall. The touched member (or, for a capture holding
  several members, the first) is set exactly; the others follow. This is exact when the
  sides matched, and otherwise leaves one side right rather than neither.
- Not attempted: un-ganging from the module. The command sets list no gang control.
- The partners' moves arrive from the console just after the write. They are marked as
  expected, so they do not change the last touched channel or start a capture.
- Seen on graphic EQs only. Ganged inputs and busses are assumed to behave the same.

### 2026-11-17: GEQ as its own scope, 0.2.5

- The maintainer asked whether the EQ key meant parametric EQ, graphic EQ or both. It
  meant both, which was fine while a capture held one channel, but captures can now hold
  a channel and the graphic inserted on it, and wanting one without the other is normal.
- GEQ is now a scope of its own: a graphic's bands, in/out switch and trim. EQ is the
  parametric EQ and filters of inputs and busses. The graphic's name stays under NAME.
- Both start lit, so a fresh connection recalls a graphic as before. A page built from
  the earlier presets has no GEQ key; without one, GEQ simply stays lit.
- Recorded scripts are unaffected: they store the values to send, not scope names.

### 2026-11-17: a page of buttons from the web page, 0.2.6

- Companion gives a module presets to drag, one at a time, and no way to lay out a page.
  The maintainer exported the page he had built so one could be shipped, then suggested
  generating it from the web page instead, and listed the form factors: Stream Deck XL
  (8 × 4), MK.2 (5 × 3), Mini (3 × 2), and tablets or the web emulator at any size.
- `src/layout.js` plans the page and writes it in Companion's page export format, taking
  every button from `getPresets`, so the file and the presets cannot disagree. The format
  was taken from the maintainer's export (Companion 5.1.1, export version 12,
  "button-layered" controls): a preset's text size 14 is stored as 29.4 and "auto" as 100
  with shrinking; a feedback's style becomes overrides on the text and background layers;
  the hold on CAPTURE is an action set named for its delay, listed in `runWhileHeld`.
- Layout rule, which reproduces the maintainer's own arrangement on the XL: page keys in
  the left column, chosen keys along the bottom row and then up the right-hand side,
  slots in every remaining cell. One rule for every size rather than a hand-made layout
  each. Each deck size has its own starting set of keys; small decks get capture keys and
  slots, with scope keys left for a second page.
- Generated for the connection asking: its label goes into the variable names. The file
  carries the connection with default settings only, so no address or library leaves.
- Risk, stated in the test log: the format is known from one export of one Companion
  version, and a generated file has not yet been imported. M31 and M32 cover that.
- A settings-page button was considered. The settings page cannot offer a download, so
  the generator lives on the web page, which the settings page already links to.
