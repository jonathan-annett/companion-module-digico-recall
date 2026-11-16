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

**Scripts copy values.** A script step stores the values that were sent when it was
recorded, plus the channel they went to. Re-using or clearing a slot later does not change
a script. The cost is a larger library; the benefit is that a script cannot change
underneath the operator.

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
