# Decisions

Each decision that shapes Pendulum, with its reason and the evidence behind
it, oldest first. A changed decision gets a new entry that names the one it
replaces; entries are not rewritten. Questions still open are at the end.

## 1. The paper stays out of the repository

*2026-11-15.* The PDF, its LaTeX source and any verbatim conversion of it are
never tracked. `physics/oracle/paper.py` rebuilds a local reference copy from
arXiv and checks it against pinned digests.

**Why.** arXiv distributes the paper under its non-exclusive licence, which
gives readers no right to redistribute it.

**Evidence.** [`physics/README.md`](../physics/README.md), "The paper is not
in this repository".

## 2. The physics is checked by an oracle in Python, outside the product

*2026-11-15.* Before anything moves on screen, every display equation of the
paper is compared with a derivation of its own. The checks are Python with
SymPy, NumPy, SciPy and mpmath, locked and run with uv, used in development
only and never shipped. They are three independent routes (the Euler-Lagrange
equations, the limits of sections 4 and 5, and Newton's law with the rod
tensions, written without the paper) and a cross-check between them.

**Why.** Computer algebra and arbitrary precision turn "is this printed
equation right?" into a test with a yes or a no. Routes that share nothing
cannot share a mistake.

**Evidence.** 400 tests in `physics/oracle/`. Of 92 display equations, 73 are
right as printed, 14 carry a misprint and 5 hold under a stated reading; the
registry, [`physics/equations.yaml`](../physics/equations.yaml), has each one.

## 3. Kept as if public, under the MIT licence

*2026-11-15.* The repository is private for now and is written as if it were
public: tracked files, commits and pull requests are for a reader assessing
the work, and working notes between sessions stay out of git. The code is MIT.

## 4. The first piece: the chain in the hand

*2026-11-15.* Pendulum is several interactive pieces. The first is one chain
pendulum to grab and throw, whose number of masses runs from one to a rope
while it moves, with twins released a hair apart that show chaos by fanning
out. The others are not decided yet.

**Why.** Chosen after trying a sketch of it. It follows the paper's own arc,
from one pendulum to n to the rope, and puts the physics in the hand.

## 5. The physics in the browser: rod tensions on the CPU, RK4 stepped by the tension

*2026-11-15.* The chain is computed on the CPU in double precision, by the
rod-tension form (`PH-4`), integrated with classical RK4 on the angles. The
substep comes from the fastest vibration of the chain, which the rod tensions
give at each step.

**Why.** Measured on two cores of a 2020 laptop processor without a GPU, with
Node 26, for a chain of n equal masses of 1 m and 1 kg in total. Energy error
is the worst value over one minute, as a fraction of the energy that lifts the
chain to the horizontal.

- The tension form costs time proportional to n and kept errors near 1e-15 up
  to 16 384 rods. The dense form, (38) or the compact one, costs n² to build
  and n³ to solve, and its conditioning reaches 3.7 million at 256 masses.
- A JavaScript port of the tension form matched the oracle within 4e-16 on 81
  states from 1 to 1 024 masses. One evaluation costs about 37 ns per mass, linear
  up to 100 000 masses.
- With few masses, RK4 wins by orders of magnitude: a double pendulum dropped
  from the horizontal at 960 steps per second keeps its energy within 1e-8 per
  minute, at 0.007 ms per frame. Euler, Verlet on the angles and RK2 do not.
- With many masses the step is set by stability, since the fastest vibration
  is near 2n√(g/L). A long chain dropped from the horizontal cracks like a whip:
  with 512 masses every fixed step up to 7 680 per second breaks, and with 128
  only 7 680 survives. With the step taken from the tension, RK4
  carries 128 masses through the whip with an energy error of 7e-3, at 3.3 ms
  per frame (8.9 ms at the peak). 512 masses thrown hard need 50 ms per frame,
  which does not fit in real time.

**Revisit when** a piece needs tens of thousands of pendulums at once. Single
precision on a GPU holds numerically (one evaluation errs by 2e-7 to 2e-6 up
to 8 192 masses) and becomes necessary only at that scale.

## 6. Drawing: WebGL2 only, called directly, without a library

*2026-11-15.*

**Why.** WebGL2 works in every major browser, 97.3% of global usage
(caniuse, 2026-11-15). WebGPU does not yet: Firefox enables it only on Windows
and on macOS 26 with Apple Silicon, not on Linux or Android, and desktop
Safari only from macOS 26. The same minimal program was built directly and
with each candidate library. A library saved 14 to 43 of its 144 lines and
added, compressed, 13 kB (twgl), 14 kB (ogl), 128 kB (three), 158 kB (pixi)
or 216 kB (three with WebGPU). regl reaches float textures and instancing only
through WebGL1 extensions; twgl and ogl had no release in over twelve months;
pixi failed silently twice; three on WebGPU does not take GLSL shaders.

**Revisit when** a piece needs GPU compute.

## 7. One app, no framework

*2026-11-15.* One app with several pieces, each on its own route, over a
shared core: physics, drawing and parameters. No UI framework. Styling is CSS
Modules over design tokens.

**Why.** Each piece is a fullscreen canvas with a few controls, and there will
be several pieces.

## 8. Language and tools

*2026-11-15.* TypeScript ~6.0, Vite 8, Vitest 5, ESLint 9, Prettier 3,
Playwright 1.65.

**Why.** A small, current toolchain with a test runner and browser automation
built for Vite. typescript-eslint 8.72.2 accepts TypeScript below 6.1 only
(checked 2026-11-15), so TypeScript 7 waits for it.

## 9. How correctness is tested

*2026-11-15.* The oracle writes fixtures in JSON that Vitest reads, compared
within 1e-12. Over long horizons, where the motion is chaotic and trajectories
cannot be compared, invariants such as the energy are checked instead.
Playwright opens every page in Chromium, Firefox and WebKit and fails on any
error. Tests come first where an answer can be checked: the physics, the
parameter registry, the shareable address. Drawing and interaction are judged
by looking at them.

**Evidence.** The sketch's port of the physics matched the oracle within
4e-16 under this method.

## 10. One registry of parameters

*2026-11-15.* Each parameter is declared once: name, range, default and how it
enters the model. That declaration feeds the control on screen, the shareable
address, the slow drift of a parameter over time and the axis along which the
twins differ.

**Why.** A new parameter is one entry and its effect, and nothing is built
twice.

## 11. A process sized to the project

*2026-11-15.* One pull request per slice, merged once CI is green. CI runs
the oracle's lint and tests and a secret scan of every commit; a pre-commit
hook scans staged changes. Automated code review runs only on changes the
author names, or that a session judges critical and the author approves.
Decisions live in this file, one entry each. Requirement ids exist only for
the physics (`EQ`, `TX`, `PH`). Work happens in Claude Code sessions that
follow [`CLAUDE.md`](../CLAUDE.md).

**Why.** Rigor in proportion to a portfolio of interactive pieces made by one
person: the checks that protect something real stay (the physics against the
oracle, secrets out of the history), and the ceremony goes.

## 12. Hosting: GitHub Pages, on a subdomain of the author's own domain

*2026-11-15.* The site will be published by GitHub Pages, under a subdomain
of the author's own domain, once the repository is public. Until then it has
no public address.

**Why.** On GitHub's free plan, Pages publishes public repositories only. It
needs no server and no account beyond GitHub, serves HTTPS, and takes a
custom domain through one DNS record. Two other homes were weighed: a server
shared with another project, which would tie the two together (one proxy, one
deploy key, one lifecycle), and a third-party static host, which adds an
account. Every URL in the build is relative (decision 7), so the site works
under any of them.

## 13. The repository is public

*2026-11-15.* The repository is public. This replaces the first sentence of
decision 3, which kept it private for the time being; the rest of decision 3
stands. Tracked files, commits and pull requests are written for a reader
assessing the work, working notes stay out of git, and the code is MIT.

**What follows.** GitHub Pages can now publish the site (decision 12). `main`
can also be set to require the CI jobs to pass before a merge, which GitHub's
free plan offers only to public repositories.

## 14. Published at the repository's GitHub Pages address first

*2026-11-15.* The site is published now at
<https://rafa-el-souza.github.io/pendulum/>, the address GitHub Pages gives
this repository. The author's subdomain stays the final address (decision 12)
and comes once its DNS records are in place; this entry adds to decision 12
and replaces nothing. Each push to `main` publishes the build that CI has just
opened in the three engines, and only after every CI job has passed.

**Why.** So that each slice can be tried on a laptop and on a phone as soon as
it is merged, before the subdomain's DNS records exist.

## 15. Time is a parameter, and the frame budget slows it

*2026-11-15.* The speed of time is one of a piece's parameters (decision
10), from slow motion to faster than real time. The author chooses its
starting value by trying. When the physics of a frame does not fit its budget
of 6 ms, time runs slower than asked, and the time control shows the speed
actually reached. This settles the open question of what happens when the
frame budget runs out.

**Why.** It was the author's idea: slow motion as one more control, not as a
limit. The chain is simulated 1 m long and drawn a few centimetres tall, so at
real time it swings like a miniature filmed in slow motion. A real chain of
that size would swing three to six times faster. A speed control fixes that
look and makes slow motion something to play with, and the budget's slowing
needs no message of its own, because the control it lowers shows it.

**Evidence.** Two masses cost microseconds of physics per frame, while 512
masses thrown hard need about 50 ms per frame on the machine of decision 5. So
only long chains thrown hard reach the budget.

## 16. Controls are discreet, fade away, and each has a key

*2026-11-15.* A piece's controls stay out of sight until the pointer moves,
a finger lifts or a key is pressed, and fade after a moment of stillness.
Keyboard focus keeps them in sight, and reduced motion makes them appear
without fading. Every control has its key, shown beside it where a pointer
hovers. How discreet they are, and when they fade, the author decides by
trying.

**Why.** The author asked for discreet controls that disappear, for a more
immersive piece, and for keys for them.

## 17. Time starts at 0.8 of real time

*2026-11-15.* A piece's time starts at 0.8 of real time, with 0.9 one step
up. This entry gives decision 15 the starting value it left to the author,
and replaces the part of its reason that expected real time to look like slow
motion: tried on the published piece, real time already looked fast.

**Why.** The author tried the first piece at its placeholder, twice real time,
found even real time fast, and named 0.8 or 0.9. The piece opens at the lower
of the two, and the other is one key away. The physics of scale in decision
15 stands; what a speed looks like is settled by trying it.

## 18. The hand runs from elastic to firm, on one control

*2026-11-15.* How firmly the hand holds the chain is one of the first
piece's parameters (decision 10), with its own keys, `,` and `.`. Each step is
a spring and a damper between the finger and the mass it holds. The spring's
rate runs from 4 to 40 rad/s for the whole chain's mass, and the damping from
0.3 of critical to critical for the mass held. At the elastic end the chain
hangs below the finger and bounces as on a rubber band: stopping the finger
does not stop the chain, which flies on past it and springs back, so letting
go as it flies past flings it. At the firm end, where the hand was before
this control and where the piece opens, the held mass stays on the finger and
a throw leaves at the gesture's speed. The line from the finger to the mass
grows brighter and wider the harder the hand pulls, so the force shows
without another control. The control shows its step as pips, and a screen
reader hears it as a count. The steps are placeholders for the author to tune
by trying.

**Why.** The author asked for a slice on the force with which the hand grabs
and throws the chain, fun to use and with a simple control, and chose this
one of five suggestions. Four stay open: a hand that slips when pulled past
its strength, a multiplier on the throw, holding the chain by its pivot, and
grabbing it anywhere along the rope rather than by a mass. The damping falls
with the spring because a soft hand damped critically drags the chain
without a bounce, which reads as sluggish rather than elastic.

**Evidence.** A chain of two masses held by its tip, with the finger still at
the pivot's height 0.7 m out, settles with the tip 34 cm below the finger at
the elastic end, then 14, 5 and 2 cm, and 5 mm at the firm end. Dragged
sideways at 3 m/s and stopped, the tip flies 18 cm past the finger at the
elastic end and 2 cm at the firm end. Damped critically, the elastic end's
spring let the tip go only 3 cm past.

## 19. The hand, the time and the controls stay as tried

*2026-11-15.* The author tried the published piece and kept three things as
they are. The hand's five steps, the line that shows its pull and the pips on
its control stay, and are no longer placeholders (decision 18). Time keeps
starting at 0.8 of real time, now chosen over 0.9 (decision 17). The controls
stay as discreet as they are and fade when they do (decision 16); how they
are laid out is left for later.

**Why.** Each of the three was left to be settled by trying, and the author
has tried them.

## 20. Twins are dropped, and time is never slowed for them

*2026-11-15.* The first piece's twins are 512 copies of the chain, born a
hair apart when it is let go or raised, which fan out in colour to show chaos
(decision 4). They end when it is grabbed. They live the same simulated time
as the chain, within a budget of their own of 4 ms per frame, beside the
6 ms of the chain's physics. When they do not fit it there are fewer of
them, dropped from the end of an order that keeps the rest spread evenly
over the fan: for any number of them, the largest gap is under twice an even
share. Time never runs slower for them, and only the chain's own physics can
slow it (decision 15). This settles the twins' part of the open question of
the frame budget.

**Why.** The author chose this on a recommendation and the numbers below.
Slowing time to carry all the twins would all but stop the piece from 32
masses up, and the chain in the hand would feel it. With fewer twins the fan
grows sparser but stays whole, and the chain keeps the time asked for.

**Evidence.** One twin costs, per frame at 0.8 of real time on the machine of
decision 5, 0.002 ms with 2 masses, 0.022 ms with 16, 0.09 ms with 32, 0.35
ms with 64, 1.6 ms with 128 and 12 ms with 512. So 4 ms carries all 512 twins
up to 8 masses, about 180 with 16, 44 with 32, 11 with 64 and 2 with 128.
Slowing time to carry all 512 would take it to ×0.07 with 32 masses and
×0.004 with 128.

## 21. Trails of light behind the tips, fading in simulated time

*2026-11-15.* The tip of the first piece's chain, and the tip of each of its
twins, leave trails of light like a long exposure. Their light halves every
2.5 s of simulated time, so a paused piece keeps them, and raising the chain
again clears them. A frame's motion is drawn in pieces, up to 480 a simulated
second for the chain's tip and 240 for each twin's, so that a fast tip draws
a curve. A tip that jumps more than half a metre in one piece, when the chain
is raised again or given other masses, leaves no trail across the jump.

The trails are kept in a target of their own: in half floats where the
browser can draw into them, and elsewhere in eight bits, where a step is taken
off every frame so that old light reaches black. They are added to the canvas
through 1 − exp(−x), so that where many cross the light saturates softly. The
chain, its twins and the hand are drawn on top, as before.

**Why.** The trail is part of the sketch the author saw when approving the
first piece (decision 4), and the port keeps its numbers. The sketch passed
the whole frame through 1 − exp(−x). Here only the trails go through it, so
that what the author has approved since looks as it did. Passing everything
through it belongs to the visual identity, which is still open.

## 22. Controls for the twins and the trails

*2026-11-15.* Two parameters join the first piece's registry, each with its
control, its keys and its place in the address.

- **The number of twins** runs over the sketch's choices, 0, 64, 512 and
  4 096, and opens at 512 (keys 9 and 0). Changing it gives new twins from
  the chain as it is. When their budget carries fewer, the control shows
  how many it carries, in the tone of a value held back (decision 20).
- **The length of the trails** is the half-life of their light: off, 0.5, 1,
  2.5 and 10 s, and ten minutes, which a visit does not see fade, so those
  trails stay until the chain is raised again. It opens at 2.5 s (keys 7
  and 8) and is shown as pips.

Each control has a drawn icon, a fan and a comet, so that it reads without
words. How they look and where they sit, the author decides by seeing. On a
phone the bar now wraps to three rows, which is part of the layout the
author has left for later.

**Why.** The author asked which controls the twins and the trails could
have, and how they would be placed, and chose to see this proposal built.
Four others stay open: how close the twins are born, which shows the
butterfly effect; which masses draw trails; keys alone, with nothing on
screen; and one switch for both.

## 23. Palettes for the twins

*2026-11-15.* The first piece's twins, and the trails they leave, take their
colours from one of five palettes, on a control of their own with the keys 5
and 6 and a place in the address. A palette gives a colour to every place
across the fan, from one edge to the other.

- **Dusk** is the sketch's ramp, blue through violet, magenta and coral to
  amber: the colours the twins have had until now, unchanged. It is the first
  palette and the one the piece opens with.
- **Fire** (deep red through orange to golden yellow), **ice** (aqua through
  sky blue to violet), **spectrum** (the rainbow, red to violet) and
  **silver** (no colour, dim grey to white) are candidates.

The control paints five dots, from one edge of the fan to the other, in the
palette's colours, and a screen reader hears the palette's name. Another
palette colours the twins at once; the trails they have already left keep
their colours and fade. The chain, its own trail and the hand keep their
colours.

**Why.** The author wants to change the twins' palette, and to keep the
sketch's for its beauty. Which candidates stay, and how they look, the author
decides by trying them.

## 24. The sketch's light on the whole frame, on a key, to compare

*2026-11-15.* The G key passes the first piece's whole frame through the
sketch's light, and pressing it again goes back. With it on, the chain, its
twins, the hand and the trails are drawn off the canvas and pass together
through 1 − exp(−x) and the gamma, as the sketch's frame did; decision 21
kept that curve for the trails alone. Where lines overlap, the light
saturates softly instead of clipping, and faint light, such as the twins and
the glow around the chain, is lifted. Where the browser keeps light in eight
bits, the frame's light is lifted as the trails' is. With it off, the piece
draws as before. The piece opens with it off, and the address does not carry
it. There is no button for it: the author chose a key alone for now, and a
button may come with the layout of the controls.

**Why.** The author wanted to see the sketch's light on the whole frame, as
a switch to turn on and off. Whether it stays, and as what, the author
decides by comparing.

## 25. How far apart the twins are born

*2026-11-15.* How far apart the first piece's twins are born is one of its
parameters: from a billionth of a radian across the fan to a tenth, by
powers of ten, with the keys 3 and 4 and a place in the address. It opens at
a thousandth, where the twins have been born until now. The control shows
the spread as a power of ten, beside an icon of two chains a narrow angle
apart, and a screen reader hears it in words. Another spread gives new twins
from the chain as it is, as another number of them does (decision 22).

**Why.** The author chose this one of the controls proposed for the twins in
decision 22. It shows the butterfly effect: however close the twins are
born, the fan opens, and being closer only delays it.

**Evidence.** From the piece's raised start, the time until the tips of the
fan's two edges are 10 cm apart, in simulated seconds: with two masses,
0.2 s at a tenth of a radian, 2.5 s at a thousandth and 10.6 s at a
billionth; with three, 0.14, 2.2 and 5.3 s; with eight, 0.12, 1.8 and 2.9 s.
Each power of ten closer delays the opening by 0.7 to 2.4 s with two masses,
and by 0.1 to 0.3 s with eight.

## 26. Trails from every mass of the chain, or from its tip

*2026-11-15.* Which masses of the first piece's chain leave trails is one of
its parameters: the tip alone, as until now, or every mass, so that the
chain draws a ribbon. It has the keys 1 and 2 and a place in the address.
The tip's trail keeps its light, and from six masses up the others are
fainter the more masses there are, at 2.2/√n of it, so that a rope draws a
sheet of light rather than a white blot. The twins' trails stay at their
tips. The control shows three masses, lit where they draw, beside a drawn
ribbon.

**Why.** The author chose this one of the controls proposed for the trails
in decision 22. With every mass drawing, the chain becomes a brush: a few
masses draw a fan of strings, and a rope draws a surface. The twins keep
drawing from their tips only, because every mass of 512 twins of 512 masses
would be over 260 000 trails to draw in every piece of a frame.

## 27. One switch for the twins and the trails

*2026-11-15.* A switch puts out the first piece's twins and trails together,
and lights them again: a button beside the pause and the raise, drawn as a
light lit or out, with the key L. Their controls keep their values (how many
twins, how far apart they are born, how long the trails last, which masses
draw them and the palette), and stepping any of them in the dark lights the
switch again. Put out, the twins end and the trails go dark; lit again,
twins are born from the chain as it is. A screen reader hears whether the
switch is on. The address does not carry it, as it does not carry the
pause.

**Why.** The author chose to have one switch for both together with their
controls (decision 22), rather than in their place.

With the switch, the bar holds eight controls and three buttons. At 1 280
px wide it wraps to two rows, and at 390 px wide to five, which take about a
third of a phone's screen. How the controls are laid out is still the
author's to decide (decision 19).

## 28. Time can run backwards

*2026-11-15.* A button beside the pause, and the key B, run the first
piece's time backwards; pressed again, they run it forwards. The chain and
its twins keep their places and move the opposite way. The energy is a
quadratic form in the rates (`PH-2`) and the equations of motion hold the
rates only squared (`PH-3`), so they are the same with time reversed, and
from there the chain retraces the motion that led there: the twins' fan
closes again towards the hair it was born as. Grabbing the chain, or raising
it again, runs time forwards, and while the hand holds the chain the key
does nothing, because the hand's damper takes energy going forwards and
would give it going backwards. The button shows two arrowheads pointing the
way a press would take time.

How far back the fan closes is set by chaos: the integration's tiny errors
grow as fast as the twins part, so after a few seconds open the reversed
motion goes elsewhere and the fan stays open.

**Why.** The author chose it from the proposals still open, on the
session's recommendation. It shows that the motion is deterministic and can
be undone, and that chaos keeps it from being undone for long.

**Evidence.** With the piece's own physics, a chain run a second forwards,
reversed and run a second more comes back to its start within 1e-12 rad with
one mass and 1e-7 rad with two. Seventeen twins of two masses, born 1e-3 rad
apart and 0.4 mm apart at the tips, stepped as the piece steps its twins (at
most 1/240 s a substep), close back to 0.4 mm when reversed after up to 4 s
of simulated time, to 3.5 mm after 5 s, and not after 6 s (10 cm); with three
masses, up to 2 s. Substeps half as long would let two masses close after
6 s, and would carry half as many twins.

## 29. Gravity: its strength, down to none, and its direction

*2026-11-15.* Gravity is two of the first piece's parameters, each with its
control, its keys and a place in the address.

- **Its strength** steps through none and the surface gravity commonly given
  for Pluto (0.62 m/s²), the Moon (1.62), Mars (3.71), the Earth (9.81) and
  Jupiter (24.79), with the keys Q and E. The piece opens at the Earth's, as
  it has until now. The control shows g = 9.81, and a screen reader hears
  where gravity is that strong.
- **Its direction** turns all the way round in steps of 15°, measured from
  straight down and to the right positive, as the rods' angles are, and comes
  round past straight up, with the keys A and D: from straight down, A points
  it to the left and D to the right. The control shows the degrees beside an
  arrow turned the way gravity points, and a screen reader hears the
  direction in words.

Both act at once on the chain and its twins, from where they are, and the
twins stay. Raised again, the chain is raised against gravity as it points.
The line of the hand still shows its pull in weights of the chain on Earth.
In the physics, gravity is a vector: it pulls every mass alike, so the
angles feel it only through the top rod, where the pivot holds the chain
against it (`PH-4`), and turned by an angle it turns the whole motion by that
angle, because the rods enter the equations only through the differences of
their angles.

What the two show. With no gravity, the twins' fan never opens: the twins
are the chain turned by a hair, and with nothing pulling, turning the chain
changes nothing in its motion, which keeps whatever spin it is given. From
rest, the strength sets only the pace: gravity and the rods' lengths are the
only scales of time, so a chain let go from rest goes through the same motion
under any gravity, slower by the square root of the ratio, and what changes
beyond the pace is how far a throw carries it. Turned under a chain at rest,
gravity tips it into motion; turned upside down, it brings the chain down
from balance, and the fan bursts open within a second.

With these two, the bar holds ten controls and four buttons: two rows at
1 280 px wide, as before, and six at 390 px. How the controls are laid out
is still the author's to decide (decision 19).

**Why.** The author chose gravity from the proposals still open, on the
session's recommendation; it was the first of the parameters proposed for
the piece. Each step of the strength is a place, two to three times as
strong as the one before. How the two controls look and feel, their steps
and their keys, the author decides by trying.

**Evidence.** With the piece's own physics, 33 twins born 1e-3 rad apart and
stepped as the piece steps its twins:

- From the piece's raised start, the fan of two masses is 10 cm wide at the
  tips after 10.1 s of simulated time under Pluto's gravity, 6.2 s under the
  Moon's, 4.1 s under Mars's, 2.5 s under the Earth's and 1.6 s under
  Jupiter's, as the square root of the ratio has it. With three masses, 8.7,
  5.4, 3.6, 2.2 and 1.4 s; with eight, 7.0, 4.3, 2.9, 1.8 and 1.1 s.
- Raised and thrown with every rod turning at 4 rad/s, with no gravity, the
  fan of two, three and eight masses stayed under a millimetre wide for 40 s.
  Under the Earth's gravity, the same throws opened it to 10 cm in 5.9, 2.4
  and 1.6 s.
- A chain hanging at rest, its twins born there, and gravity turned at once:
  by 15°, the fan had not opened after 40 s; by 90°, it opened to 10 cm in
  9.6, 4.9 and 3.0 s with two, three and eight masses; by 180°, in 1.1, 0.8
  and 0.4 s.

Tested: turned by any of four angles, gravity gives the oracle's
accelerations, tensions and energies at every angle turned with it, within
1e-12, for every number of masses in the oracle's states (`PH-4`, `PH-2`);
Newton's law with the hand holds under gravity drawn in any direction; with
none, a thrown chain of three masses keeps its energy to 2.3e-8 and its
angular momentum about the pivot to 3.8e-9 over 10 s; and a chain let go
under the Moon's gravity goes through the Earth's motion, slower by the
square root of 9.81/1.62, to within 7.6e-13 rad with fine substeps.

## 30. While there is one piece, it opens at the site's root

*2026-11-15.* The chain in the hand opens at the site's root,
<https://rafa-el-souza.github.io/pendulum/>, and its own address,
`chain-in-hand/`, forwards there with the settings it carries, so that links
shared before keep working. This holds only while it is the only piece: the
build stops at a second one until the root lists the pieces again. The page
that listed the pieces is removed until then. For as long as there is one
piece, this changes decision 7, under which every piece opens on a route of
its own beneath a page that lists them.

**Why.** The author asked for it, for as long as there is only one piece. A
list of one piece is a click between the visitor and the piece, with nothing
to choose.

## 31. The controls wait behind one small button

*2026-11-15.* A piece's controls no longer show as a bar. When the pointer
moves, a finger lifts or a key is pressed, only a small button comes into
sight, in the bottom right corner: a little chain of three masses hanging,
which reads as the three dots of "more" too. It fades after the same moment
of stillness as the bar did. The button opens a thin row of small icons,
without words, one per control: the actions (pause, time backwards, raise
again, the light switch), then what moves the chain (masses, time, the hand,
gravity's strength and direction), then the light (twins, their spread, the
trails, which masses draw, the palette). Where the row does not fit, as on a
phone, it scrolls sideways and fades at the side with more of it; a wheel
turned up and down scrolls it too. An action's icon acts. A parameter's icon
shows that one value above the row, with its − and +, and with its keys where
a pointer hovers. A key steps its parameter with the row open or shut, and
shows the value it changed, alone. When the machine holds time back
(decision 15), time's value shows itself the same way, unless the visitor is
reading another value in the open row. The row stays open or shut as the
visitor leaves it, and Escape shuts it. A mouse resting on the controls keeps
them in sight, and a click leaves the focus where it was, so that only focus
from the keyboard holds them. Each icon is described by its value to a
screen reader.

This settles the layout that decision 19 left for later, and changes where
decision 16 shows the keys: in each icon's tooltip and beside the value
shown, no longer beside every control. Where the button sits, how it looks
and moves, and how small the icons are, the author decides by trying.

**Why.** The author asked for a layout that keeps the piece's mood: discreet,
the screen free of distractions, gone when not needed. He suggested a
charming button that brings out the controls, or a very discreet bar of small
icons with a handy scroll. This joins the two; it was the recommendation, and
he chose it to try. With ten controls and four buttons the bar had reached
two lines on a laptop and six on a phone, and the mouse that throws the
chain brought all of them into sight.

**Evidence.** At 1 280 by 800 px the open row fits on one line, below the
circle the chain can sweep. At 390 px it shows 334 px of its 576 and scrolls,
and it lies below that circle too.

## 32. The controls, as the author tried them by hand

*2026-11-15.* After trying decision 31 on a laptop and a phone, the author
gave four notes, and the controls follow them. A parameter's value opens
right above its icon, centred on it; it follows the icon as the row scrolls,
and stays on the screen with its keys. On a touch screen, a touch on the
controls keeps them in sight for 8 s rather than 2.5, they still take a
touch while they fade, and a touch where they are, seen or not, only brings
them back: it never reaches the stage to grab the chain, and the click it
ends in works nothing that was out of sight. A touch anywhere else on the
stage puts them away. Where the row does not fit, a chevron over the side
with more shows it, and a touch on it scrolls the row that way. The button's
target grows from 40 to 48 px, its glyph unchanged. This adds to decision
31. The stay of 8 s and the look of the chevron are placeholders, which the
author settles by trying.

**Why.** His notes: a value should open right above its icon, centred; on a
phone the controls stayed in sight too short a time after the button, and a
touch on the button also grabbed the chain; where the controls do not fit,
something discreet should make it plain that there are more to drag to; the
button's size is right, but its area could be a little larger. The grab came
from two gaps. The controls stopped taking touches as soon as they began to
fade, while they were still in sight for 0.6 s; and a touch where they had
been went to the stage, where a touch anywhere grabs the nearest mass.

**Evidence.** The three browser tests written for the notes fail on the
controls of decision 31 and pass now. On the touch test, a touch on the
faded button set the paused chain going, which only a grab does. In an
emulated phone the controls stayed in sight 8.1 s after a touch on them.

## 33. The chain starts raised, or in one of the paper's normal modes

*2026-11-15.* Where the first piece's chain starts is two of its parameters,
each with its control, its keys and a place in the address.

- **The mode**, with the keys N and M, steps from the start the chain has had
  until now, raised to one side, through the four lowest normal modes of the
  equal chain (`PH-6`, `PH-7`): the shapes in which the chain, let go from
  rest, swings without changing its form, each at a frequency of its own.
  The control shows the mode's number, and a dash for none. Its icon is a
  standing wave with its nodes.
- **The amplitude**, with J and K, is the largest angle of any rod from the
  way gravity points, from 2° to 180°, opening at 30°. Its icon is a pendulum
  with the marks of its swing.

A start in a mode puts the chain at rest in the mode's shape, about gravity
as it points, and lets it go. Small, the chain keeps the shape and its twins
stay together; large, the shape breaks up and the fan opens. The button and
the key R start the chain again from the start chosen, and are now called
"Start again". Stepping the mode, or the amplitude of a mode, starts the
chain again at once. While the start is raised, the amplitude has nothing to
do, and its control shows it held back. A chain with fewer masses than the
mode asked for starts in its highest, and the control shows that one, held
back. A chain still swinging as it started, not grabbed since, starts again
in its mode when its number of masses changes; one the hand has held keeps
its motion, as before. With no gravity there is no mode: every frequency is
zero, and a chain started in one stays where it was put. Turned, gravity
turns the mode with it.

How the modes are found. For n equal masses on n equal rods, the paper's
difference equation (65), written from the bottom mass up, is the
three-term recurrence of the Laguerre polynomials. So the squared
frequencies in units of g / l are the zeros of L_n (`PH-7`), which the
browser finds by bisection on the polynomial's Jacobi matrix, and in mode k
mass j, counted from the top, moves sideways by L_{n−j} at the k-th zero
times the tip's motion. The statement `PH-7` speaks of the frequencies; the
oracle's test of it checks the shapes too.

How many modes the control offers, the amplitude's steps and its opening
value, the keys and what R does are placeholders, which the author settles
by trying.

**Why.** The author chose it from the proposals still open, on the
session's recommendation. It puts the checked paper to work in the piece,
and it answers, from the paper itself, an idea of the author's: stable
configurations offered as ready starts. It is built as the chain's starting
point, so that other starts can join it.

**Evidence.** The browser's modes against the oracle's, found from the
linearized chain by an eigensolver with no Laguerre polynomial in the route
(`physics/fixtures/chain-modes.json`): within 4e-11 of each squared frequency
and 4e-10 in the shapes at 512 masses, and within 1e-15 up to four masses.
Against the Laguerre zeros at fifty digits, the oracle's file is right to
4e-11 at 512 masses. With the piece's own physics, a chain let go in a mode
1e-4 rad wide is mirrored after half a period and back after one, within
1e-8 of the amplitude, from one mass to 128.

What a visitor sees, with the piece's own physics:

- **How far the masses move.** At a largest angle of 10°, the tip moves 12
  to 17% of the chain's length either way in mode 1, about 2.5% in mode 2,
  about 1% in mode 3 and half that in mode 4, with eight masses or more. For
  the same sideways motion, the rods of a higher mode turn further, about as
  the square of its number, so the higher modes show only at amplitudes
  where they begin to break.
- **How long a mode holds.** Started in modes 1 to 3 of 2, 3, 8 and 32
  masses, with 33 twins born 1e-3 rad apart and stepped as the piece steps
  its twins, the fan did not open to 10 cm within 40 s at 30° or less. At
  45° only mode 3 of three masses opened it, after 8.3 s; at 60°, also mode
  3 of eight, after 12.8 s; at 90°, every one but mode 1 of eight, after 2.5
  to 34 s. Over the first 20 s, the part of the chain's angles outside the
  mode's shape stayed under a tenth of the amplitude in every case at 20°,
  and under a fifth at 45° in modes 1 and 2.

## Open

- **Dimension.** The first piece is planar; depth may come with later pieces.
- **Frame budget and target devices.** The sketch budgets 6 ms per frame for
  the physics and 4 ms for the twins; real devices will set the numbers.
- **Which browser versions** count as the major browsers.
- **Accessibility.** Keyboard control and a pause always within reach from the
  start; reduced motion and the rest still to be decided.
- **Languages.**
- **Visual identity.**
- **Friction.** It is not in the paper. Whether the first piece has it, and of
  which kind, is open.
- **The order in which parameters arrive.**
