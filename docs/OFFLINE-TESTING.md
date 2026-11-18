# Testing against the DiGiCo offline software

A run sheet for testing the module against each version of DiGiCo's offline console
software, as far as that can go without a console. Part is done by a script, part by
someone (or Claude with computer use) working the software's screen.

What this can show: which settings each console version answers for and accepts, how it
rounds values, what it announces when a control is moved, how gangs behave, and that the
module's own arithmetic holds on real software.

What it cannot show: anything about audio. No bumps, dips, meters with signal or real
preamps. Those remain in the manual plan in [TESTING.md](TESTING.md) for a console.

## Machines

| Machine     | Runs                                                                    | Role                                                   |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Windows PC  | The offline console software, Node, this repository, Claude desktop app | The test tool; mouse work by computer use              |
| MacBook Neo | Companion with the recall and proxy connections                         | Module-level tests through Companion, over the network |

## Once, on the Windows PC

1. Install Node 22 or later (`winget install OpenJS.NodeJS.LTS`, or from nodejs.org).
2. Get the repository: `git clone https://github.com/jonathan-annett/companion-module-digico-recall`
   and `cd companion-module-digico-recall`. No `yarn install` is needed for the tool.
3. Check: `node tools/offline-test.mjs` prints its usage.

## For each console version

Use a label that names the console and the software version, for example
`"SD9 offline V1742"`. It becomes the file name of the results.

### Setup (by hand or by computer use)

1. Start that version of the offline software. Load or create a **scratch session**: the
   write tests change one input channel and put it back.
2. **Setup > External Control**: Enable External Control = YES. One device, type
   **DiGiCo Pad**, IP `127.0.0.1`, send port `8000`, receive port `8001`, ticked.
   Press **load** and choose the iPad command set. Note the name of the set you chose.
3. If the tool says NO ANSWER, set Enable External Control to NO and back to YES.

### A. Read-only (changes nothing)

```
node tools/offline-test.mjs --label "<console and version>"
```

About ten seconds. Records which settings answer on one channel of each kind, the bus EQ
family, whether meters answer a query, and what happens when a setting that does not
exist is asked for.

### B. Writes and the module's functions (changes one input, puts it back)

```
node tools/offline-test.mjs --label "<console and version> write" --write
```

About a minute. On the highest-numbered input (or `--channel N`): each setting is changed
a little, read back and restored; then capture, compare, put back, fader to unity and
the gain nudge are run and their arithmetic checked. The last line says whether the
channel was left as found. Any line starting `UNEXPECTED` or `NOT RESTORED`, or ending
`: NO`, is a finding.

### C. What the software announces (mouse work)

Each step: start the watch, do the action on the software's screen within the time, and
the tool records what was announced. Use a new label per step so the files are separate.

```
node tools/offline-test.mjs --label "<console and version> W1" --watch 30
```

| Step | Action on the screen while the watch runs                                                         | What it tells us                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| W1   | Drag the fader of input 1 up and down                                                             | Touch detection: the address, how many messages a drag makes, how fast                                                    |
| W2   | On input 1 change the analogue gain, the trim, one EQ band's gain, the compressor threshold, mute | The address of each, and whether any is announced under a name the module does not know (shown in the file's `addresses`) |
| W3   | Open a graphic EQ and move three bands                                                            | Graphic EQ addresses                                                                                                      |
| W4   | Gang two graphic EQs that have different curves. Move one band on one of them several times       | The tool's "gangs seen" line should name the pair. The file shows both members' messages and their timing                 |
| W5   | With that pair ganged, apply one of the console's own graphic EQ presets to one side              | Whether a console preset is announced at all, and for which side                                                          |
| W6   | Change an input's aux send from post-fader to pre-fader and back                                  | Whether pre/post is announced, and at what address. The module currently cannot read this                                 |
| W7   | Rename input 1                                                                                    | Name changes are announced                                                                                                |
| W8   | Store a snapshot, change the fader of input 1, then recall the snapshot                           | **Whether a snapshot recall is announced.** If it is not, the slot comparison needs its refresh button after a snapshot   |
| W9   | Set Enable External Control to NO, wait five seconds, set it to YES                               | What, if anything, the software sends when the link is re-enabled                                                         |
| W10  | Do nothing                                                                                        | What the software sends unprompted (should be nothing, or meters)                                                         |

### D. Reading the screen

These are things only the screen can tell us. Record the answers in the results folder as
`<console and version> screen.txt`.

1. **Graphic EQ band frequencies.** Open a graphic EQ. What frequency is the left-most
   band, and the right-most? How many bands?
2. **EQ curve numbers.** For each value 1 to 4, set band 1 of group 1 to it and look at
   which shape the EQ display shows for that band (bell, low shelf, high shelf, notch,
   or something else):

   ```
   node tools/offline-test.mjs --label "<console and version> curve 1" --set /Group_Outputs/1/EQ/eq_curve_1=1
   ```

   Repeat with `=2`, `=3`, `=4`. Then the same for band 4 (`eq_curve_4`), in case the
   bands differ.

3. **Limits as the screen shows them.** For group 1, band 1: the lowest and highest
   frequency, gain and Q the on-screen control will go to. They should match 20 Hz to
   20 kHz, ±18 dB and 0.1 to 20.
4. **The External Control screen**: the exact name of the command set loaded.

### E. Through the proxy (when A to D are done for a version)

On the console, change the device row's IP to the MacBook Neo's address. In Companion on
the Neo, enable the proxy connection (console address = the Windows PC) and point the
recall connection at the proxy (`127.0.0.1`, port `8101`).

```
node tools/offline-test.mjs --label "<console and version> via proxy" --host <Neo address> --send 8101 --listen 8102 --write
```

The results should match run B. Differences are findings about the proxy. While it runs,
the proxy's Traffic tab should show the tool as a client beside the recall module.

## Results

Every run writes two files into `test-results/`: a `.json` with everything and a `.txt`
with the summary lines. Commit them (`git add test-results; git commit; git push`) or send
them back, with the `screen.txt` notes. They are entered in the test log in
[TESTING.md](TESTING.md).

## For Claude on the Windows PC

The following can be given to Claude in the desktop app (Claude Code tab, with computer
use enabled) once the repository is cloned:

> Read `docs/OFFLINE-TESTING.md` in this repository and carry it out for the console
> software that is currently open. Use the terminal for the `node tools/offline-test.mjs`
> commands and computer use for the steps on the software's screen. Take a screenshot
> before and after each screen action. For the watch steps, start the command with
> `--watch 45`, then do the action straight away. Do not change anything in the session
> other than what a step asks for, and use only the scratch session. If a step cannot be
> done because a control cannot be found, write that down in the notes and go on to the
> next step. At the end, list the result files, quote every summary line that starts with
> UNEXPECTED or NOT RESTORED or ends with ": NO", and write the section D answers to
> `test-results/<label> screen.txt`. Do not commit or push; leave the files for review.
