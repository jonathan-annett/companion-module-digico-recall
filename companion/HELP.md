# DiGiCo Recall

Capture whole channels from a DiGiCo SD or Quantum console at the press of a button, and
put back just the parts you choose (EQ, COMP, GATE, LEVEL, AUX, GAIN, PAN, DELAY, NAME).
Chain recalls into scripts, save and restore channel names, and browse or edit everything
in a web page.

It talks to the console the same way the DiGiCo iPad app does.

## Console setup

1. On the console: **Setup > External Control**, set **Enable External Control** to Yes.
2. Add a device, type **DiGiCo Pad**. Enter the IP address of the computer running
   Companion, a **send port** (default here: 8000) and a **receive port** (default 8001).
3. Switch the device on in the list (green tick).
4. In this connection's settings enter the console's IP address and the same two ports.

The console accepts one iPad-type device. To keep using a real iPad as well, turn on
**Relay a real iPad through this module** and point the iPad app at the Companion computer
instead of the console.

## Buttons

Everything is in the **Presets** tab, ready to drag onto pages.

**Capture**

- **CAPTURE**: press it (red), then nudge a fader or hit solo or mute on the channel you
  want. The module reads the whole channel (amber), then waits for you to press a slot.
  Press CAPTURE again to cancel.
- **GRAB**: reads the last channel you touched, without arming first.
- **TO**: where recalls land. ORIGINAL sends a capture back to the channel it came from.
  TOUCHED sends it to whichever channel you touched last, so a capture works like a
  preset you can drop on any channel (inputs, groups, auxes and matrices share EQ and
  dynamics addresses, so input to group works too).

**Recall scope**

- Toggle keys: EQ, COMP, GATE, LEVEL, AUX, GAIN, PAN, DELAY, NAME, OTHER. Only the lit
  ones are sent when you recall. EQ includes the filters; LEVEL is fader and mute; GAIN is
  analogue gain, trim, pad and polarity; OTHER is insert on/off plus anything learned.

**Slots**

- A slot button stores when a capture is waiting, otherwise it recalls. Green means it
  holds something, blue means it was the last one recalled. The button shows what it holds.
- Graphic EQs are captured the same way: touch a band on the GEQ, press a slot. Recall
  them with the EQ scope on.

**Scripts**

- **SCRIPT REC**: press, then press slots (changing scopes between presses if you like).
  Each recall happens live and is added to the script. Press SCRIPT REC again, then press
  a script button to store it. After that the script button replays the lot.
- A script keeps its own copy of the values, so re-using the slots later doesn't change it.

**Names**

- **NAMES SAVE n** reads every channel, bus, GEQ and control group name into name set n.
- **NAMES n** writes that set back to the console.

## Web page

Open `http://<companion address>:<port>/instance/<this connection's label>/`
(for example `http://127.0.0.1:8000/instance/digico-recall/`).

- **Captures**: see every value in a capture, edit or remove values, relabel the button,
  point it at a different channel, copy it to another slot, or send it to the console.
- **Scripts**: rename, reorder or remove steps, retarget a step, edit its values, run it.
- **Names**: read all names from the console, edit them in a grid, send back only what
  changed. Load and save name sets.
- **Library**: download everything as one file, or replace it from a file.

## What is not captured

Phantom power, main/alt input switching and solo states are left alone on purpose. Routing,
insert assignments, and plug-in style processing that the iPad app can't reach (Mustard,
Spice Rack, Nodal processing, Waves) are not available over this link.

**Learn** (in the settings): when on, any channel parameter the console reports that isn't
in the module's list is added to future captures of that channel type. Turn it on, wiggle
the control on the console once, and check the Library tab to see what was learned.

## Where things are stored

The library lives in this connection's configuration, so it travels with a Companion
export. You can also name a file in the settings to keep a copy on disk.
