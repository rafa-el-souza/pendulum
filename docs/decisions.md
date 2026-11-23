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

## 34. A moment of the chain is saved in the address

*2026-11-15.* A button after "Start again", and the key S, save the chain's
moment in the page's address: every rod's angle and rate, written after the
"#" as `moment=` and base64url, as 32-bit floats, seven significant digits
to a number. Copying the address keeps the moment and shares it, and an
address that holds one opens there. The part after the "#" never reaches a
server, so a long chain's moment is as safe as a short one's: 22 letters
with two masses, 5 462 with 512. Each angle is brought within half a turn
of zero first, which leaves the chain as it was, since the rods enter its
equations only through the sines and cosines of their angles and of their
differences (`PH-3`, `PH-4`).

While a moment is kept, it is the chain's start (decision 33): R brings the
chain back to it, exactly as the address holds it, and the controls of the
mode and of the amplitude show held back, having nothing to do. An address
holding a mode and a moment starts at the moment. The button's bookmark is
full while a moment is kept. Saving again keeps the new moment instead.
Choosing a start, a mode or the amplitude of one, starts the chain there and
forgets the moment; so does another number of masses, since a moment
belongs to a chain of so many, and a moment of another number of masses
than the address asks for is not taken. The twins are born again from the
moment; the trails are not kept.

The key, the button and what forgets the moment are the session's choices,
which the author settles by trying.

**Why.** The author asked to save and restore the state, and chose the
address over the browser's own storage and over both: it keeps a moment and
shares it, and it is where the piece's other settings already are. A saved
moment is also how a configuration found by hand can be kept, which the
modes of decision 33 began from the paper's side.

**Evidence.** A moment comes back from the address within seven significant
digits, for one mass to 512. In a chaotic motion, those digits are enough
to part the motion restored from the one it was taken from within seconds,
as the twins' fan shows for any small difference: with the piece's own
physics, from the raised start run 3 s, the restored tips were 10 cm from
the original's 7.1 s later with two masses, 3.7 s with three and 0.65 s
with eight. Started in a mode at 30°, mode 1 of eight masses and mode 2 of
32, they were not 1 mm apart after 60 s. Another machine's frames part a
chaotic motion the same way, whatever the digits.

## 35. The chain can be painted by its tension

*2026-11-16.* A switch after "Light", and the key T, paint each rod of the
chain by its tension, and give the chain its own colour back. It is off as
the piece opens and, like the light, is not kept in the address.

A rod's colour measures its tension against the weight it holds hanging
still on Earth: the Earth's gravity times the mass at or below it (M_j of
`PH-3`). A chain hanging at rest on Earth holds one weight in every rod
(`PH-4`) and keeps its own colour all along. With the Earth fixed in the
measure, it stands under any gravity and with none, as the hand's line does
(decision 29): at rest under Jupiter's gravity the chain is warm, under the
Moon's it is cool, and with none it is slack.

The scale has the chain's own colour at one weight. Above, it goes a quarter
of the way to the hot end each time the tension doubles, through amber at two
weights and orange at four to red at sixteen and more. Below, it goes in a
straight line to blue as the rod goes slack, and on to violet as it pushes,
reaching it at a push of one weight. The rods of these equations are rigid
and can push, which a chain of links cannot do, so the violet marks where a
real chain would fold.

The colour shown is each rod's tension averaged over the motion of the
frame, as the substeps of RK4 meet it, and eased a quarter of the way each
frame, as the hand's line is. Each mass takes the colour of the rod it hangs
from, and so does the trail it leaves, which then paints the tension over
the space the chain sweeps. The twins keep their palette. The switch's icon
is a spring balance: its hook empty while the chain keeps its own colour,
filled while it is painted.

The measure, the scale and its colours, the easing, the colour of the masses
and of the trails, the twins' palette, the key, the button and its icon, and
keeping the switch out of the address are the session's choices, which the
author settles by looking.

**Why.** The author chose it from the proposals still open, on the
session's recommendation: the force running through the chain, which the
physics computes at every substep, did not show until now.

**Evidence.** With the piece's own physics, at sixty frames a second and
time at ×0.8:

- Started in mode 1 at 30°, a chain of 2, 8 or 64 masses holds between 0.90
  and 1.26 weights in every rod, the most at the bottom of the swing, so the
  colour breathes, warmer as the chain passes the bottom. Mode 2 of two
  masses at 30° runs from 0.36 to 2.36.
- From the raised start, which is chaotic, the tensions run from pushing to
  pulling with many weights, the more so towards the tip of a long chain:
  over 20 s, from −3.4 to 27 weights with two masses, −36 to 119 with eight,
  −539 to 905 with 64 and −4 386 to 10 288 with 512. Rods push in 17 to 21%
  of the rods' time.
- In that motion, the colour of the instant at each frame's end jumps by half
  the scale or more from one frame to the next in 18% of the rods' frames
  with eight masses, and in 45% with 64 or 512: the chain would flicker.
  Averaged over the frame, in 16, 29 and 4%; averaged and eased, in under
  0.05%, as in a chain whirled by the hand and let go. With two masses, under
  0.05% even at the instant.
- The colour adds 4 to 5% to a frame's physics with 64 and 512 masses.

Tested: hanging at rest, the tension averaged over an advance is the weight
below each rod (`PH-3`, `PH-4`); whipping, it is within 8.5e-7 of an average
sampled 4 000 times, and sixteen times closer with half the substep, as the
fourth order of RK4 has it; stopped short by the frame's deadline, it is the
average over the time simulated. Measured in Earth weights, every rod of a
chain hanging at rest on Earth holds one, with equal masses and unequal.

## 36. The pivot can shake, and the chain stands on its head

*2026-11-16.* A control after gravity's direction, with the keys C and V and
a place in the address, shakes the pivot a millimetre either way along the
line of gravity, 800, 1 200 or 1 600 times a second, or keeps it still, as
the piece opens. Turned on, it starts the chain again standing straight on
its head, leaning 0.1 rad, and R starts it there while the pivot shakes: the
chain stands, swaying slowly about upright. A shake that changes or stops
leaves the chain where it is, and a chain standing falls when it stops. A
mode or a saved moment still starts the chain where they say.

In the frame of a pivot moving a cos(W t) along a line, every mass feels,
besides gravity, a W² cos(W t) along it: the chain moves there as under a
gravity that oscillates, and its equations are the same (`PH-4`). So each
stage of RK4 solves the chain under the gravity of its own instant, and the
substeps are no longer than 0.3 / W. This is Kapitza's pendulum: averaged
over the fast shake, the slow motion is that in a potential with a second
minimum, upright, where the chain stands when the shake is small beside its
rods and fast. The shake's phase is carried from frame to frame, turned over
when time runs backwards so that the pivot retraces its motion too, and the
twins are shaken from the same point of it. The hand acts in the pivot's
frame. The pivot is drawn as a short streak along its line, a sign of the
shake: a millimetre would not show.

With the tension's colours (decision 35), the shaken chain shows each rod's
tension over whole periods of the shake. Within a period, a shake of 800 Hz
swings every tension by about 2 600 weights either way; over a whole period
that averages out, and over a frame it does not. The stepper lands a
substep on every whole turn of the shake and closes the period there. A
chain standing shows violet: its rods hold it up by pushing, which a chain
of links cannot do.

The amplitude, the steps, the keys, the start standing and its lean,
starting there as the shake turns on, the streak, and the place in the row
are the session's choices, which the author settles by trying.

**Why.** The author chose it from the proposals still open, on the
session's recommendation: of them, the effect that surprises most, a chain
that stands on its head without falling.

**Evidence.** With the piece's own physics:

- Against Kapitza's averaged potential (Landau and Lifshitz, *Mechanics*,
  §30), one pendulum 1 m long shaken 2 cm stands upside down from 225 rad/s
  and falls at 220, the edge a² W² = 2 g l being at 221 rad/s. Shaken at
  300 rad/s, it swings about upright in 2.1976 s against the potential's
  2.1955 s, and hanging in 1.1917 s against 1.1915 s.
- Which chains stand, started straight and leaning 0.05 rad, over 20 s:
  shaken 2 cm, one to three masses, from a W of 4 to 5 m/s, and four, six
  and eight never; shaken 1 mm, one and two masses from 4.5 m/s, and three
  to twelve from 4 m/s. Sixteen, 24 and 32 do not stand at all: under a
  tension that swings by thousands of weights, their fastest vibrations
  reach half the shake's rate, and the shake feeds them until the chain
  comes apart, within the first frame with sixteen. The smaller the shake
  beside the rods, the more masses stand.
- So the shake is a millimetre, and its steps are an a W of 5.0, 7.5 and
  10.1 m/s, on each of which one to twelve masses stand. Started straight,
  two masses stand from up to 0.3 rad off upright, four and eight from 0.2
  and twelve from 0.1; the start leans 0.1 rad. From the raised start, on
  any step, the chain does not climb up: it ends hanging or tumbling, which
  is why the shake starts it standing.
- Over whole periods of a shake of 2 cm at 300 rad/s, a chain standing
  upright pushes with the weight below each rod to within 6.4e-6 of a
  weight, while the instant swings by 185 weights either way and the mean
  over a frame of 1/120 s is up to 139 weights off.
- A frame of a shaken chain's physics takes 0.2 to 0.8 ms from two masses
  to twelve; with 64 masses at 1 600 Hz, 11 ms, past the frame's budget, so
  time runs slower (decision 15). The twins are dearer too: 4 to 32 fit in
  their budget, where 200 to 600 fit with the pivot still.

Tested: the edge of stability and the two rates against the averaged
potential; a chain on one line through the pivot, upright, staying there
under the shake (`PH-5`); the substep; the tension over whole periods of a
chain standing upright; and the periods closed across advances, the first,
seen only in part, dropped.

## 37. The first piece is called Pendulum, for now

*2026-11-16.* The first piece's name, which begins its page's title and so
names a bookmark and a shared link, is "Pendulum", and the README calls it
so. The folder of its code and its route, `/chain-in-hand/`, which forwards
to the site's root (decision 30), keep the working name, the chain in the
hand, as do the entries above.

**Why.** The author found the working name literal, which is what he liked
in it, but not a name, and chose Pendulum until the piece has one of its
own, for the title and the README. The route stays: the name is for now,
and the piece opens at the site's root.

## 38. A saved moment carries the whole screen, in a short code

*2026-11-16.* Replaces what decision 34 kept of a moment, and what decisions
24, 27 and 35 said of the address. The address carries the first piece's
switches: the light of the twins and the trails, the tension's colours and
the sketch's light on the whole frame. Without a saved moment it stays
readable, as decision 10 made it, and carries them as `light=0`,
`tension=1` and `sketch=1` when they differ from how the piece opens.

S saves the whole screen in a code after the "#", in place of the readable
part: the value of every control, every switch, whether the piece was
paused and which way its time ran, where the shaken pivot was in its cycle,
the minute the moment was saved, and the moment itself. Opened, the screen
comes back: the controls and the switches as they were, paused if it was
paused, its time running the way it ran, the shake where it was, and the
chain at the moment. R starts the chain again there, with its time running
that way and its shake at that point. A control or a switch changed after
saving rewrites the code around the same moment; choosing a mode, the
amplitude of one, or another number of masses still forgets the moment,
and the address is readable again. The twins are born again from the
moment, and the trails start empty: neither fits in an address. And the
limit of decision 34 stands: even restored exactly, a chaotic motion parts
from the one it was saved from within seconds, since every machine steps
time in frames of its own.

A control is written as the place of its value among the values its table
names, in as few bits as they need: five for the 18 numbers of masses, one
for the ribbon. The screen without the moment takes 12 bytes, and the
moment eight to a mass in the 32-bit floats of decision 34, all in
base64url. The first byte is the code's version, and the table of each
version, the controls in order with every value each had and the switches,
is frozen once published: a control or a value added makes a new version,
written beside the old one, which keeps reading the addresses written with
it. An address of decision 34, the values readable and `#moment=` after the
"#", still opens where it was saved.

The page's title names the screen: the piece's name; what differs from how
it opens, in a few words; and for a saved moment, the minute it was saved,
in the visitor's time zone and with the year when it is not this one, and
a mark of four letters drawn from the moment and that minute, in letters
that read without doubt (Crockford's base 32, without I, L, O or U), as in
"Pendulum · 8 masses, the Moon · 16 Nov 01:42 · K7QF". Two bookmarks of
one piece read apart.

The words of the title, their order, the mark, and what the summary leaves
out (the mode and its amplitude while a moment is saved) are the session's
choices, which the author settles by seeing them.

**Why.** The author called it a bug that a saved moment did not bring the
screen back with it: the idea is that a state, a screen, is reproduced.
Asked what the address should carry, the author chose every control; asked
how to shorten the links, a compact code after the "#", with a button to
share and a QR code, which are another pull request's. The author leaned
towards a title with what differs, the minute and the mark together, to
tell bookmarks apart, and chose that without a moment the address stays
readable and carries the switches.

**Evidence.** The address of a saved moment, the site's included, is 80
letters long with two masses and 144 with eight, whatever the controls,
and 5 520 with 512. The screen measured on the published page before this
change, eight masses on the Moon with three controls of the light changed,
took 175 letters, and brought back neither its switches nor its pause; two
masses with nothing else changed took 71, the moment alone. The code's
first twelve bytes, written for eight masses on the
Moon with the tension's colours, paused and saved at 01:42 UTC on 16
November 2026, were checked bit by bit against the table, and a test keeps
that code opening as it did. Another test keeps the newest table equal to
the registry. A screen comes back from its code for one mass to 512, its
moment within seven significant digits and the shake's phase within a
512th of a turn. In the browser, a screen saved with eight masses on the
Moon, the three switches changed and the piece paused opens in a browser of
its own with the same controls, switches, pause and title.

## 39. The site's icon is a frame of the piece

*2026-11-16.* The site has an icon, for the browser's tab, its bookmarks and
a phone's home screen: a frame of the first piece, drawn by its own
physics. Two masses let go from the piece's raised start, with 48 twins
born a thousandth of a radian apart as the piece bears them, 4.983 s later,
when their fan has opened into a wing: the chain as light, with a soft
glow, over its twins in the first palette, from blue to amber, on the
piece's ground, in a tile with rounded corners. `web/scripts/icon.ts` draws
it (`npm run icon`) and writes it as SVG, with a PNG of 32 px for browsers
that take no SVG icon, and one of 180 px for a phone's home screen, square,
since the phone rounds it itself. The build copies the three as they are.

The frame, the glow, the tile and the sizes are the session's choices,
which the author settles by seeing them. Drawn from the same motion and
looked at beside it, at 16 to 180 px and in light and dark tabs: other
frames, before the fan opens much (at 4.6 s, a narrow sail) and after (from
5.05 to 5.1 s, a wider one); a dozen thick twins in place of 48, to read
better at 16 px; the chain alone, which at 16 px reads as a caret; a round
tile; and a halo drawn as a wide faint stroke, which read as a grey
outline.

**Why.** The author asked for an icon worthy of the project. A frame of the
piece shows what the piece is, a chain drawn as light and twins that show
chaos, in its own colours, and drawing it from the physics keeps it true to
the piece.

**Evidence.** SVG icons are taken by Chrome and Edge from version 80,
Firefox from 41 and Safari from 26 (caniuse, "SVG favicons", read on
2026-11-16); the PNG covers older Safari. The script writes the same bytes
again on a second run. A browser test checks that the root links the three
icons and that each one is served.

## 40. The address can be shared, and shown as a QR code

*2026-11-16.* Two buttons after "Save this moment", with the keys H and O,
share the page's address and show it as a QR code, whatever it holds: the
readable values and switches, or a saved screen's code (decision 38).

Sharing hands the address and the page's title to the device's own sheet,
where the browser has one, as phones do; where it has none, or the sheet
refuses, the address is copied, and the button turns into a tick and a word
says "Link copied" for two seconds. The QR code opens on a card in the
middle of the screen, with the title under it, and follows the address
while it is open; Escape, the card's close button or O again shut it. Its
dark modules are the piece's ground on the chain's light, the way readers
expect them, with the four light modules round the code that its standard
asks for.

The code comes from the `qr` library (MIT or Apache-2.0, no dependencies),
at its lowest error correction, which holds the most: a code on a screen is
read whole. A code holds at most 2 953 letters, so the address of a saved
moment fits with up to about 270 masses; past that, the card says the
address is too long, and that fewer masses make it shorter. The library
loads only when the card first opens, in a file of its own of 6.5 kB
compressed, beside the piece's 22.7 kB.

The keys, the icons (a box with an arrow rising out of it, as phones draw
sharing, and a QR code's three corners), the card and the word are the
session's choices, which the author settles by trying them. Drawn and set
aside for the icons: three nodes joined, as other phones draw sharing, which
beside the row's chains read as masses; an arrow leaving a box, which reads
as opening elsewhere; two links of a chain; filled squares, which read as a
grid of apps; and a phone.

**Why.** The author asked for a clean and cheap way to shorten the links,
and chose the compact code of decision 38 with a button to share and a QR
code. Of a small library and an encoder of the project's own, the author
chose the library the session recommended: it carries a reader too, with
which the tests check that the code drawn reads back as the address.

**Evidence.** The libraries measured before the choice, each bundled with
the piece's own tools and minified, the encoding alone, compressed:
`lean-qr` 4.2 kB, `uqr` 4.3 kB, `qr` 7.3 kB, `qrcode-generator` 8.3 kB;
`qrcode`, the best known, needs three other packages. In the unit tests, the
path the card draws, put into pixels, reads back as the address of a saved
moment of 1, 8, 64 and 256 masses; 384 and 512 give no code. In the
browser, the code on the card, drawn on a canvas and read in the test, is
the page's address, before and after a moment is saved.

## 41. Grounds, more palettes, and scales for the tension's colours

*2026-11-16.* Three controls of the first piece choose its colours, each
with its keys and its place in the address, after the light's controls.

- **The ground**, with the keys U and I, coming round from either end: one
  of eleven dark grounds, the night the piece has had first, then slate,
  navy, indigo, plum, wine, rust, espresso, olive, forest and teal, once
  round the colours. Each brings the colours that must stand out from it:
  the chain's (and so its trail's, the light of the QR code's card and the
  middle of the tension's scale), the hand's, the pivot's, and the row's
  words and icons, which are the chain's colour sunk a little into the
  ground. The canvas, the page and the row change at once; the trails
  already drawn keep their colours and fade. The page's tokens keep the
  first ground for the first paint, and a test holds the two together.
- **The twins' palette** (decision 23) gains five candidates after the
  first five, whose places addresses already name: blossom (rose to peach),
  gold (bronze to a pale gold), meadow (deep green to yellow), neon
  (magenta to cyan) and reef (teal and coral facing each other across a
  pale middle).
- **The tension's scale**, on the key Y beside the T that turns the colours
  on (decision 35), coming round from the last: heat, decision 35's, then
  incandescent (a slack rod glows dull orange, and one pulling hard goes
  past white to the blue of the hottest stars), neon (cyan and blue cold,
  pink, magenta and violet hot) and verdant (indigo and teal cold, lime and
  greens hot). Each paints the same places, a push, a slack rod and 2, 4
  and 16 weights, around the chain's colour. Stepping it turns the colours
  on. The control paints its five colours as dots.

The grounds are dark because the piece adds light to the canvas; a light
ground would need another way of drawing, ink that darkens where it draws,
which the author set aside. The icons are a paint roller for the ground and
a thermometer for the scale; drawn and set aside: a frame with a pendulum
in it and a filled frame cut by one, which read as a sign with "!", two
squares overlapping, which read as arranging layers, a picture with a
mountain, a circle half filled, which reads as switching between light and
dark, a bar of three cells, which reads as a battery, a wedge, which reads
as a volume, and a fan of colour cards. The new colours, the keys and the
icons are the session's choices, which the author settles by looking.

A saved moment's code gets its version 2 (decision 38): the palette's ten
values, and the scale and the ground after it, one byte more than version
1. Version 1 still opens, on the first ground and scale.

**Why.** The author asked for new palettes, for the tension and in
general, and for a choice of ground among a good number of pleasant
colours. Of a ground that carries everything, a ground with its own
tension's scale, a palette that carries the tension's scale, and three
controls, the author chose the three controls, and the ground as a control
of the row with its place in the address, as the session recommended.

**Evidence.** Unit tests hold every ground dark (a relative luminance under
0.025) and the chain, the hand, the pivot and the row's words clear of it
by their contrast ratio (over 12 for the chain, 7 for the words, 4.5 for
the rest); the first five palettes and the first scale as they were; and
codes of both versions. In the browser, the ground's keys change the canvas
and the page and come back to the same frame, the scale's key turns the
colours on, and an address carries both.

## 42. The trails' light fades to the dark, and can leave a mark

*2026-11-16.* Three changes to the first piece's trails.

- **Their light always fades.** The trails are kept in half floats where
  the browser can draw into them (decision 21), and a half float rounds a
  fade smaller than half a step of its precision back to the light it had.
  A frame's fade shrinks with the frame: at a tenth of real time, with
  trails of 10 s, or on a screen of 120 frames a second, it fell below that
  step, and light stopped fading at half or more of what it had been, and
  stayed. The fades are now gathered, frame after frame, and applied once
  together they take off a 256th of the light, which rounding cannot undo.
- **The step that stays, stays.** The last step, written 600 in the
  address, had a half-life of ten minutes that the rounding above kept from
  ever showing; it no longer fades at all.
- **A step that leaves a mark.** Before it, a step written 100 fades as the
  piece opens, with a half-life of 2.5 s, and keeps in a second target, at
  every point, the brightest piece of trail drawn there. The mark shows
  under the trails, through the same curve, after they have faded: a memory
  of where the chain and its twins went, the same on every screen. Leaving
  the step puts the mark out; the light switch, R and trails off clear it
  with the trails. Its half-life, how bright the mark is (the brightest
  piece, as drawn) and its place on the control are the session's choices,
  which the author settles by looking.

A saved moment's code gets its version 3, with the trails' seven steps. A
code the published page wrote in version 2 is kept in the tests, and opens
as it was.

**Why.** The author saw light near white that did not seem to fade, and
asked whether a mode could keep the old behaviour beside the fix. The old
behaviour depended on the screen's frame rate, the speed of time, the
half-life and how the graphics card rounds, so it could not look the same
everywhere; of the fix alone, the fix with the old behaviour imitated on a
switch, and the fix with a step that leaves a mark on purpose, the author
chose the last, as the session recommended.

**Evidence.** In Chromium, a half-float target holding light 1 was faded
frame by frame as the trails were, for twenty half-lives, after which a
millionth is left. At 0.8 of real time and 60 frames a second it reached
8·10⁻⁶ with a half-life of 2.5 s; at a tenth of real time, and with 10 s
trails at 120 frames a second, it stopped at 0.53; at a quarter with 10 s,
at 0.85. Gathered as now, every case reached under 10⁻⁵. A unit test that
rounds to half floats shows the same: the light stops above a half frame by
frame, and reaches a millionth gathered.

## 43. The twins can stay, or fade as chaos carries them off

*2026-11-16.* A parameter joins the first piece's light, after the spread:
whether the twins stay or fade, on the P key, coming round, with `fade=1`
in the address.

- **They stay,** as they have until now and as the piece opens: once the
  fan has opened, they fill the disc, a cloud that does not go.
- **Or they fade.** Each twin's light falls with how far it looks from the
  chain, the root mean square of the distances between its masses and the
  chain's, as a share of the chain's length: whole while the two look as
  one, a third at three tenths of the chain's length, and all but out at
  twice that. It never rises again, so a twin that chaos has carried off
  stays dark where it crosses the chain: the light measures how far the
  chain can still be foretold from it. A twin gone dark is born again on
  the chain as it is, at its own place in the fan, so that it keeps its
  colour and its share of the spread; at most a sixty-fourth of the twins
  is born in a frame, taken in turn, and where the budget carries more
  twins than there are, new ones are born too. The twins come out of the
  chain as a plume that comes apart in the chaos, and their trails, dimmed
  with them, weave along the chain's paths instead of filling the disc.

Switching gives new twins from the chain as it is, as another number or
spread does. The control's icon is a candle just put out, its smoke rising
and coming apart. A saved moment's code gets its version 4, and a code the
published page wrote in version 3 is kept in the tests, opening as it was
with the twins that stay. The reach, the births in a frame and the icon
are the session's choices, which the author settles by looking.

**Why.** The author asked whether the twins could fade, as the trails do,
and then said that twins that fade and twins that do not each have their
charm, so the twins that stay are kept beside the new ones, not replaced.
Of four ways to fade them (each fan fading with a half-life after its birth
and born again once gone, as if it breathed; the light by the distance; a
flow of births at the chain; none, as until now), the session recommended
the light by the distance with the flow and built it to be seen. While the
twins fade, the budget's room fills again, so twins the budget dropped
come back; the twins that stay still come back only when new ones are
born, which stays open.

**Evidence.** Captured in Chromium at 0.8 of real time with two masses and
512 twins, after 1.6, 4.8, 11 and 19 simulated seconds: the twins that stay
fill the disc with a pink cloud by 11 s; the twins that fade leave it dark
between their trails, which weave a ball of light about the chain's paths.
Without trails, the plume is a fringe of colour along the chain. Reaches
of a fifth, three tenths, 0.35 and a half of the chain's length were
compared: at a fifth the plume barely shows, and at a half the trails fill
the disc nearly as the cloud does. Of eighteen icons drawn and looked at in
the row at its size, the fan's variants read as the twins' own control
beside them, and the candle put out read at once.

## 44. The piece listens to music

*2026-11-17.* The first piece can listen to music, and a card shows what it
hears. Nothing it hears acts on the chain yet: light comes next, then
forces, each in its own entry.

- **Where it is.** A button at the end of the row's actions, two beamed
  eighth notes, and the W key open a small card over the controls' corner:
  a meter of the last three seconds of loudness with the attacks marked and
  the three bands beside it, the loudness in decibels, the source (off, the
  microphone, a file, the demo beat), what it is doing in words, and the
  line "Sound stays on this device." Shutting the card leaves the music
  playing; Escape shuts it.
- **The sources.** Each starts on a touch, as browsers ask. The microphone
  is asked for with the browser's treatment of voice off (echo cancelling,
  noise suppression, automatic gain), which is made for calls, spoils music,
  and on Android puts the device in call mode; where the input in use is
  worn on the head, a headset wired or Bluetooth, the device's own
  microphone is asked for by its id. A file plays round and round. The demo
  beat is a kick, a snare and a bass that the page makes itself as a
  function of time: eight bars at 120 beats a minute, two of them quieter.
  It plays aloud, its first bar at once and the rest once rendered, and the
  page hears it straight from the function at the time of the sample being
  played, so that, muted where a browser gives no sound, it is the same
  beat. On an iPhone or an iPad the card says that the microphone stops
  music playing on the device itself.
- **What is heard.** Each frame takes the latest 2048 samples and hears
  them with the piece's own arithmetic, the same in the page and in the
  tests: a radix-2 Fourier transform; the loudness, and the power in three
  bands (30 to 150 Hz, 150 to 4 000 Hz, 4 to 16 kHz), each read against its
  own last fifteen seconds or so, so that music played quietly and loudly
  moves the piece alike; and the attacks in each band, the rise of its
  third-octave pieces since 30 ms before (the spectral flux), against the
  flux's own habits. A band that holds 30 dB less than the whole sound, or
  is quieter than −68 dB, strikes no attack; below −60 dB for 0.3 s the
  music is silent.
- **The sound stays on the device.** Nothing is recorded or sent, and the
  microphone is let go when the card is turned off or another source
  starts.

The analysis runs on the page's main thread; the slice of the beat's clock
moves it to the browser's audio thread. The card's look, place and words,
the icon and how the beat sounds are the session's choices, which the
author settles by trying and listening.

**Why.** The author asked for a music visualizer and settled its design in
a round of questions: a layer over the piece as it is first, and an
ambient mode later; music acting as force and as light, the chain always in
the paper's equations; a card on an icon and the W key; a demo beat with
sound, which serves the tests muted; the analysis on the main thread first.
This slice, the piece hearing, comes first so that he can check on his own
devices that the sound arrives. Research for the design found that no
source covers every case: a microphone hears what plays aloud, in any
browser, but nothing in headphones, and on an iPhone opening it interrupts
the music playing on the phone itself; the sound of a tab, the next slice,
serves desktop Chrome and Edge with any output; and Spotify gives new apps
no beat data.

**Evidence.** The transform puts a sine in its bin, keeps Parseval's sum,
and matches the transform summed term by term. The hearing found every
attack of a kick drum's thumps and of a hi-hat's ticks, with none in the
other band, from 24 to 165 frames a second at 44.1 and 48 kHz; at 10 frames
a second its window of 43 ms misses the ticks that fall between frames.
Over the demo beat it hears more than nine in ten kicks and snares, and no
attack where nothing starts; the bass's notes are attacks in the low band
too, as they are in music. The same music played 30 dB apart reads alike
after a while. In the browser the demo beat moves the meter in the three
engines, muted where an engine gives no sound, a file plays and is heard,
and the microphone path runs in Chromium and Firefox on their fake
microphones. CI runs them on a sound server with no speakers: without one,
Firefox passed no samples from a file or a microphone to the page and
WebKit's audio clock stood still; with one, their audio took over a second
to start, which the page waits for, up to four seconds. Of six icons drawn and looked at in the row, headphones
suggested listening in headphones, where a microphone hears nothing, a
speaker suggested volume, and bars of levels a voice; the two beamed notes
read as music at once.

## 45. The music can come from a tab or the screen, and through a chosen microphone

*2026-11-17.* Where the browser shares sound, desktop Chrome and Edge, the
music card gets one more source, "tab": the browser's own dialog shares a
tab, a window or the whole screen, and the piece hears its sound. And
where there are several microphones, the card lists them while it listens
through one, and listens through the one chosen.

- **The share.** Browsers share a picture with the sound and refuse sound
  alone, so the page asks for the picture at a frame a second, never shows
  it, and keeps it while it listens, since whether a share whose picture
  stops keeps its sound is not documented. The dialog lets the visitor
  leave the sound out, and the card then says how to put it in. The whole
  computer's sound is offered beside a screen, which Chrome gives on
  Windows and ChromeOS, and on macOS 14.2 or later from Chrome 142; on
  Linux, a tab's sound only. Stopping the share from the browser's own bar
  stops the listening, and the card says so.
- **Where it shows.** Only in a Chromium browser on a desktop, as the
  browser's client hints tell it; Firefox and Safari share pictures without
  sound, and phones share nothing.
- **The microphones.** The list is the browser's, with the names it gives
  once one microphone is allowed; choosing one listens through it by its
  id, without the choice of the device's own over a headset (decision 44).

**Why.** The author asked for this slice right after the first, in the
design round: on a desktop the sound of a tab is the source that works with
any output, headphones included, and with it ready he can try whether the
protected sound of a music service's tab is shared or comes through silent,
which no document answers.

**Evidence.** Chromium's fake share, accepted without asking, gave a screen
with sound, which the card heard; its two fake microphones were listed, and
choosing the second listened through it. Firefox and WebKit show no button.
Not checked: real shares on the author's machines, a streaming service's
protected sound, whether stopping the picture keeps the sound, and the
whole computer's sound on Windows and macOS.

## 46. The music lights the chain, its trails and its twins

*2026-11-17.* The music card gets a mode and a strength, and the first
mode, the one the piece opens in, is light only: the physics does not hear.
Each frame, the routes of the mode take what the music says to what it
lights, each with an attack and a release, and the strength, in five steps,
multiplies them all.

- **Light.** A kick widens the chain's halo and brightens it, and lets it
  go over a quarter of a second; the loudness gives the trails up to twice
  their light; and every attack has a sixteenth of the twins born again from
  the chain as it is: while they fade, the dimmest first, a puff out of the
  chain; while they stay, in turn round the fan. Nothing lights an area:
  the halo stays a few pixels round the chain's line.
- **None.** The music does nothing, and the card only shows what the piece
  hears.
- **Routes as data.** A route names a signal, a target, a depth, an attack
  and a release, and a mode is a list of routes. What they give is a record
  a frame of what the music adds to the light, which the drawing reads; it
  never writes the values of the controls. Paused, the halo still answers
  the music, and nothing is born.
- **Reduced motion.** Where the system asks for it, no route follows faster
  than 0.4 s up and 1 s down, and nothing is born on a beat.
- **The address.** The mode and the strength go in the readable part where
  they differ from how the piece opens (`?music=none&strength=5`), and stay
  there, before the "#", beside a saved moment's code, which does not carry
  them until the modes are settled. A link with a mode never starts
  listening: the visitor starts a source.

The depths, the times, the strength's steps, the names and the card's two
new rows are the session's, which the author settles by seeing and
hearing.

**Why.** The second step of the music in the order the author chose: light
first, before the physics takes forces from it. His choices in the design
round: music acting as force and as light, the chain always in the paper's
equations, the music's routes never writing the controls, and no flash over
a large area.

**Evidence.** The routes follow a step at once without an attack, fall to
1/e over their release, add up on one target and scale with the strength;
an attack gives births in its own frame only; with reduced motion a kick's
first frame lights less than a tenth and nothing is born. In the browser,
the mode and the strength go into the address, stay beside a saved moment,
and open again from it. Captured in Chromium with eight masses and the demo
beat, frames a tenth of a second apart: the halo widens on the kicks and the
twins born again light the chain, then fan out; with "none" the chain stays
as it was.

## 47. The music is measured against all of it heard, then its last six seconds

*2026-11-17.* The loudness and the three bands are each read against the
music's own past (decision 44). That past began as the first frame heard and
then followed the music over fifteen seconds or so. It is now the mean of all
the music heard until there have been six seconds of it, and from then on it
forgets at that pace. This replaces the fifteen seconds of decision 44;
nothing else in it changes. The six seconds are the session's placeholder,
which the author settles by seeing.

**Why.** The author found that in some music the signals seemed not to move.
Measured on four excerpts of 45 s that he chose (an electronic track, a beat
in 5/4, metal percussion, and a calm piano without drums), heard at sixty
frames a second, the first frame heard came 28 to 30 dB under the rest of
each, as a song's first moments are quiet, and the hearing took it for how
loud the music was. The loudness and the bands
then stayed at their top for the first 12 to 20 s of each, while that was
unlearned, and the trails, which follow the loudness, stayed near their
strongest.

Before the piece's own arithmetic was changed, the author asked whether a
library could give these signals instead. Of the libraries for the browser,
one listens live, is maintained, and has a licence that fits this
repository's: realtime-bpm-analyzer (Apache-2.0), which reports each kick
drum and the tempo. The fuller ones are under the GPL or the AGPL
(Essentia.js, aubio), or analyse a whole file at once, and none gives the
loudness or the bands. On the electronic excerpt, against its 83 kicks, the
library found 64 percent, 95 percent of its reports on a kick, and went
silent for 3.2 s over five kicks like the others; the piece's own found 70
percent, and a third of its reports fell off a kick. The author chose to
keep the piece's own kick, and to weigh the library's tempo again with the
beat's clock.

**Evidence.** Two tests, red before the change: music whose first tenth of a
second is 40 dB quieter reads as normal within two seconds (its loudness's
mean between 0.2 and 0.8, where it stayed at 1); and a part 10 dB louder
reads at least 0.15 higher in its first second, and within 0.1 of before a
dozen seconds on (with fifteen seconds it was 0.16 off). On the four
excerpts, the share of the music's time each measure spent at its top (0.98
or more) is shown below, for the loudness, the bass, the middle, the treble
and the trails' strength:

| Excerpt | Before | After |
|---|---|---|
| Electronic | 0.39, 0.41, 0.35, 0.51, 0.36 | 0.00, 0.11, 0.00, 0.07, 0.00 |
| Beat in 5/4 | 0.46, 0.72, 0.64, 0.67, 0.52 | 0.04, 0.25, 0.06, 0.17, 0.02 |
| Metal percussion | 0.33, 0.51, 0.39, 0.43, 0.36 | 0.00, 0.00, 0.00, 0.01, 0.00 |
| Calm piano | 0.37, 0.61, 0.64, 0.17, 0.39 | 0.00, 0.11, 0.01, 0.10, 0.00 |

What remains at the top after the change is the peaks of kicks and notes.
How long the past is remembered mattered far less than how it begins: with
4, 6 and 8 s the excerpts read within a few hundredths of each other, and only
the beat in 5/4, which gets about 10 dB louder at 19 s, told them apart.
The published page, playing the electronic excerpt in a headless browser
that draws about ten frames a second, did not show the fault: its first
frame came after those quiet first moments, where a screen at 60 Hz or more
hears within them.

## 48. The music's hits, notes and bass line are heard

*2026-11-17.* The hearing (decision 44) gives three new events and a new
measure: a **hit**, something broad in frequency for a moment, as a drum or
a cymbal; a **note**, the beginning of something that lasts, a note or a
chord; and the **bass's note**, with its **change** to another. Each frame
now gets the latest 8 192 samples, and the spectrum still hears the last
2 048 of them. Nothing in the piece follows the new signals yet: the
effects that use them come next, for the author to see.

- **Hits and notes** are told apart by medians, a harmonic and percussive
  separation. Of the frames of the last 0.15 s, the one in their middle is
  judged: in each bin, the median of the bins 180 Hz either side is what is
  broad there, the median of the span's frames is what lasts, and the bin
  is shared between the two by their squares. A hit is an attack of the
  broad part (its third-octave pieces rising against the habits of their
  rise, as in decision 44) in the middle band or the treble, where the
  broad part holds at least 0.3 of that band's energy. A note is an attack
  of the lasting part between 150 Hz and 4 kHz, its pieces' rises summed,
  each counted from no lower than 24 dB under the loudest piece. Both are
  heard 75 ms late. Under 150 Hz, at this window, a kick and a bass note
  cannot be told apart, so no hit is heard there, and the kick, heard at
  once, stays what it was: any attack in the low band, which lights the
  halo (decision 46).
- **The bass's note** is the period of the sound under 300 Hz, low-passed
  and taken at about 4 kHz, by YIN's difference function over the last
  70 ms or so, from C1 to about D4. A period whose normalized difference
  dips under 0.15 is a note. A change is a note of another name held for
  40 ms; an octave apart is the same name.
- **The demo beat** is heard a window at a time, working out only the
  samples new since the window before.
- **Routes** (decision 46) can take the three events as they take the
  attacks.

**Why.** The author chose these signals for the effects of the music: the
twins born again on hits only, an event when a note begins, and the bass's
note, which can colour the piece. On his four excerpts, any attack came two
to five times a second, on notes as on drums, so the twins born again on
every attack were born continuously and marked nothing.

A single frame cannot tell a hit from a note at this window. Judged on one
frame, without waiting, a piano's hammer is as broad as a snare: on the
calm piano, the broad part rose at its attacks as much as at the drums'
attacks of the other three excerpts, by each of the three measures tried.
Judged over the frames around it, 75 ms later, the broad part held 0.3 or
more of the middle band at 69 to 93 percent of the middle band's attacks in
the three excerpts with drums, and at 12 percent of the piano's.

**Evidence.** Tests first, on made-up sounds heard frame by frame as the
page hears them. Chords changing every second under a hi-hat, a snare and a
hi-hat, heard at 30, 60 and 144 frames a second, give one hit at every drum
and none at the changes, and one note at every change and none at the
drums. A bass line of known notes, half a second each, is followed note by
note from 0.15 s into each, with one change for each. The demo beat's bass
is followed under its kicks, bar by bar; more than nine in ten of its
snares are hits, and no hit comes away from a kick or a snare. A first try
heard a hi-hat's spill into an empty piece of the middle band as a note at
30 frames a second; counting each piece from no lower than 24 dB under the
loudest mended it.

On the four excerpts, at sixty frames a second, over their 45 s of music:

| Excerpt | Attacks | Hits | Notes | Bass changes | Bass note heard | Named as the reference |
|---|---|---|---|---|---|---|
| Electronic | 232 | 189 | 102 | 60 | 38% of frames | 80% |
| Beat in 5/4 | 229 | 213 | 96 | 58 | 28% | 59% |
| Metal percussion | 163 | 161 | 68 | 23 | 12% | 96%, on 1% of frames |
| Calm piano | 100 | 8 | 76 | 70 | 77% | 75% |

The reference is pYIN, offline, under 300 Hz, which hears a bass note in
64, 48, 7 and 86 percent of the excerpts' frames; the last column counts
the frames where both hear one. The hearing costs about 0.35 ms a frame on
the demo beat and up to 0.9 ms on these excerpts, measured in Node, where
it cost about 0.15 ms before; working out the demo beat's whole window of
8 192 samples cost 2.65 ms a frame. At ten frames a second the span holds one or two frames; the tests
check 30 frames a second and more.

## 49. The music's effects come as candidates, side by side

*2026-11-17.* What the music does to the first piece's light comes as
candidates, each a mode of the music card, so that the author can compare
them while music plays and keep what he likes. "light" (decision 46) stays
first, as the piece opens, and "none" last; each candidate between them is
light with one thing changed. The depths, floors and times are the
session's placeholders.

| Mode | What changes from light |
|---|---|
| glow | The kicks light the halo three times as strongly, and it goes over 0.35 s instead of 0.25 |
| hits | The twins are born again on the hits of drums only (decision 48), not on every attack |
| kicks | An eighth of the twins are born again on the strongest kicks only, those above 0.75 |
| linger | The trails last longer the louder the music is than its middle, up to four times as long, instead of brighter |
| dashes | The trails brighten on the kicks, up to three times, instead of with the loudness |
| fan | The fan opens wider for the twins born again the louder the music is than its middle, up to a hundred times |
| hue | The note the bass holds colours the chain and its halo |
| twin hue | The note the bass holds colours the twins |

- **Routes** (decision 46) may count a signal only above a floor, what is
  above stretched from 0 to 1. Two targets join the light: how much longer
  the trails last, as a share of the time their control gives, and how much
  wider the fan opens at a birth, in powers of ten, as its control steps.
- **The halo** may grow twice as far as before, for the glow candidate:
  light reaches past its old limit only at the highest strength.
- **A note's colour.** A mode may colour the chain or the twins with the
  note the bass holds, kept until another is held. The colour comes in
  while the bass has played in the last second and goes over a second of
  silence, and eases from one note to the next over 0.08 s. The twelve
  notes go round the wheel of hues by fifths, so that notes a fifth apart
  are neighbours and those of a key lie together, each bright.
- **The card's words** for a share that came without sound depend on what
  was shared, where they used to ask for a tab whatever it was: for a tab,
  tick its audio; for a window, which shares no sound, pick the tab; for a
  screen, tick its sound where the browser offers it, or else pick the tab.

**Why.** The author found the effects of decision 46 hard to see, save the
halo, which he wanted stronger, and asked for experiments and measurements
to choose from. Measured on his four excerpts, at sixty frames a second and
the middle strength, as the page computes the light from what it hears:
light's halo grows from 5 px to 6.4 to 6.9 px at its 90th percentile, a
pulse; its trails stay 1.4 to 1.9 times as bright from the 10th to the 90th
percentile, nearly constant, since the loudness, read against the music's
own, moves little once eased; and its twins are born again 2.2 to 5.2 times
a second, a tenth to a fifth of the fan each second, on notes as on drums,
so that the fan is born again continuously. Each candidate answers one of
these, and the measures below show how much more each moves.

**Evidence.** Unit tests: a floor counts the strongest kicks only; the new
targets add as the others do; the bass's colour comes in with its note,
stays through a frame without one, changes with the next note held, goes in
silence, and stops whole at the highest strength; the twelve colours differ
and are bright, a fifth apart as neighbours; the card's words follow what
was shared. The browser test of the modes in the address goes through the
candidates. In a headless browser playing the electronic excerpt through
the file source, every candidate drew without an error: glow's halo wider
on the kicks, hue's chain and twin hue's fan in the bass's colours. Pulses
cannot be judged in stills; the author judges them playing music.

On the four excerpts, at sixty frames a second and the middle strength:

| Measure | Electronic | Beat in 5/4 | Metal percussion | Calm piano |
|---|---|---|---|---|
| light, the halo at its 90th percentile and at most, in px | 6.8, 8.1 | 6.9, 8.2 | 6.5, 7.9 | 6.4, 8.1 |
| glow, the same | 10.7, 14.3 | 11.2, 14.5 | 9.9, 13.8 | 9.7, 14.3 |
| light, births a second | 5.2 | 5.1 | 3.6 | 2.2 |
| hits, the same | 4.2 | 4.7 | 3.6 | 0.18 |
| kicks, the same | 0.58 | 0.80 | 0.20 | 0.22 |
| light, the trails' light from the 10th to the 90th percentile | ×1.67 to 1.85 | ×1.63 to 1.92 | ×1.58 to 1.65 | ×1.43 to 1.79 |
| dashes, the same | ×1.00 to 1.90 | ×1.00 to 1.96 | ×1.00 to 1.73 | ×1.00 to 1.62 |
| linger, the trails' time, the same | ×2.2 to 2.9 | ×1.9 to 3.4 | ×1.5 to 1.9 | ×1.1 to 2.6 |
| fan, the width at birth, the same | ×5.6 to 26 | ×3.6 to 48 | ×2.1 to 3.9 | ×1.1 to 14 |
| hue, changes of colour a second | 1.33 | 1.31 | 0.51 | 1.58 |

## 50. The trails can be a strobe's, and the twins dust

*2026-11-17.* Two modes of the first piece's light, controls of the piece
on which the music acts, for the author to see:

- **A strobe's trails.** The trails' control (decision 22) has a step after
  ten seconds and before the one that leaves a mark, written 50: the whole
  chain is stamped into the trails twelve times a second of simulated time,
  instead of its masses drawing lines, and each twin's tip as a point on
  the same flash; the copies fade over a second. While the music plays in
  a mode that flashes it, as every mode of decision 49 but "none" does, the
  flashes come on the kicks instead; with reduced motion asked for, at even
  times.
- **The twins as dust.** The twins' P key (decision 43) goes round stay,
  fade and dust, written 2: each twin is drawn as its tip alone, a point of
  light, and leaves no trail, so that the fan is a cloud of sparks. The
  points swell as the music lights the halo.
- Both are kept in the readable address and named in the page's title, and
  the saved moment's code takes a fifth version for them; codes of the
  fourth keep opening.

The rate, the lights and the sizes are the session's placeholders. Each is
a step of a control that was there; whether either becomes a control of
its own, beside the trails' length and the twins' staying or fading, the
author decides by seeing.

**Why.** The author found the trails and the twins hard to notice under the
music, and asked for other modes of them, thought through, and perhaps
apart from the music. Of three drawn for the trails (a strobe; embers, a
trail whose colour changes as it ages; a comet, a tail of fixed length) and
three for the twins (dust; heat, each twin's colour by how far it has gone
from the chain; a cloud, the twins born apart in every direction), he chose
the strobe and the dust to see first. A strobe is how a pendulum is
photographed with a flash that fires again and again; under music, its
copies mark the kicks.

**Evidence.** Unit tests: the trails' steps and their words, and the
strobe's half-life; the P key's three steps; the title's words; the fifth
code carrying both, and a code of the fourth, as the published page wrote
it, still opening; a route that flashes on a kick, and none with reduced
motion asked for. The browser tests of the trails' keys and of the P key
step through both. In a headless browser, with two masses and with four,
with and without the electronic excerpt playing, the strobe drew a fan of
copies of the chain, fewer and on the kicks with the music, and the dust
points of light round the chain, swelling on the kicks. In the first
captures the twins' own trails, drawn as lines, hid both; they now follow
the mode, points on the strobe's flashes and none as dust.

## 51. The twins move in workers, and the chain is computed a frame ahead

*2026-11-17.* The first piece's twins are dealt out to Web Workers, one for
each of the device's cores but one, from one to seven: twin j to worker
j mod W, so that any first part of the fan is spread over all of them. Each
worker keeps its twins' states and advances them by the same step, in the
same pieces, as the piece's own loop did (decision 20); a test checks that
the two give the same numbers, bit for bit. Once a frame the page sends
each worker a command, a plain record of what enters the twins' physics
(the time to advance and in how many pieces, gravity, the shake of each
piece, where the chain is at the end), with the events since the last one,
in order: twins born, kept, given other masses, run backwards. Each worker
sends back where its twins are, in buffers handed over rather than copied,
and the page draws them and their trails.

A worker's answer comes back only after the frame that asked for it. So,
while there are twins, the chain is computed a frame ahead: each frame
draws what the frame before computed, the chain and the twins the workers
brought back for the same instant, and then computes the next one and
sends it out. While the hand holds the chain there are no twins, and a
frame is computed and drawn at once, as before. The cost: with twins on
the screen a key acts a frame later, 16 ms at 60 Hz; let go, the chain's
fan appears a frame later, born on it; resumed from a pause, a frame is
shown twice. A moment saved is the one on the screen.

Each worker may take the frame's free time, until 2 ms before the screen's
next frame, at least 1 ms and at most 10 ms, eased over the frames. The
screen's rhythm is read from the last frames, never slower than 60 Hz's;
while the frames come later than it, as where the page draws without a
GPU, there is no free time, and each worker takes 1 ms. A browser that
holds the frames to 30 a second counts as late too. For twins in workers
this replaces the 4 ms of decision 20. As there, the twins a budget
cannot carry are dropped from the end of the fan, and so are those a
worker has not reached by four times its budget, and time never runs
slower for them. Where no worker can run, or one fails, every twin is lost
and the twins run on the main line again, with the 4 ms of decision 20.

**Why.** The author chose workers for the twins' bottleneck, the 4 ms of
one core that decision 20 gives them, and approved this design before it
was built. Drawing the twins a frame behind the chain, the plainest way,
would show the closed fan as a coloured copy trailing the chain; shared
memory, which would let the page wait for the workers inside a frame,
needs two response headers that GitHub Pages does not send. A rewind of the
piece, when it comes, needs the same rule, since rebuilding the twins from
a snapshot takes the workers' time too. The budget follows the frame's free
time so that a screen at 120 Hz, with half the time, carries fewer twins on
its own, and a phone works harder only when more twins are asked for than
fit. It is measured against the screen's rhythm, not against the frames as
they come, because a page that falls behind would otherwise take its own
delay for free time: so it was at first, and in CI's Chromium, which draws
on the CPU, the workers carried two to three times more twins than the main
line had, the page had to draw them all, and the browser tests that draw
many of them ran 1.5 to 1.9 times slower, two of them past their 30 s.
Batching each worker's twins in one array, which had been estimated at
one and a half to two times faster, was measured first and left out: the
chain's own arithmetic, which batching leaves as it is, is 70 to 88% of a
twin's cost, so it could gain at most 1.4 times with 2 masses and 1.15 from
16 masses up.

**Evidence.** On the machine of decision 5 (two cores), at 0.8 of real time
in 60 Hz frames, one twin costs 0.0025 ms per frame with 2 masses, 0.013
with 8, 0.052 with 16, 0.16 with 32 and 0.63 with 64: 4 ms carries 1 333,
250, 64, 21 and 5 of them, and seven workers at 10 ms each would carry
4 096 (all of them), 4 096, 1 120, 371 and 91. In headless Chromium a
worker's answer came back 0.1 ms after its work; seven workers sharing two
cores answered within 11.5 ms, none after the next frame. Unit tests: a
share advances its twins as the piece's loop did, bit for bit, in every
share of a fan, shaken or not; it applies the events in order, drops the
twins it has not reached by four times its budget, and times their motion
alone; the workers deal the fan out in turn, keep the first part that every
worker carried, draw no report from before the fan was put out, and give
the twins to the main line when one fails; the frames' rhythm gives the
time until 2 ms before the next frame of a screen at 60 or 120 Hz, less
while the frames come a little late, none while they come at 10 or 30 a
second, and leaves out a hidden tab's pause. In headless Chromium on this machine, which draws on the CPU,
told of four cores so that the page opens three workers, at 1280 × 720,
the page drew as many frames a second as before the workers, with about as
many twins: 14.4 with 129 twins at four times real time with the twins
fading, against 11.7 to 13.4 with 78 to 163 before the workers (and 6.9 to
7.3 with 394 to 456 while the free time was read from the frames as they
came); 6.3 with 612 of 4 096 asked, against 6.0 with 650. With the one
worker this machine's two cores give, the page, always late there, carries
fewer than the main line did: 188 of 4 096 with 2 masses. The main line's
own work for the twins, mostly their trails, is about half a microsecond a
twin a frame; on a CPU, drawing them is what costs. The first frames
showed the fan born on the chain. The browser tests of the twins run through the workers in
Chromium, Firefox and WebKit, and a new one checks that the page opens a
worker for each core but one and writes how many of 4 096 twins they carry.

## 52. While the frames come late, the twins' workers keep the main line's 4 ms between them

*2026-11-18.* Replaces, in decision 51, the 1 ms each worker took while the
frames come late: each now takes at least its share of the 4 ms the main
line gave all the twins before the workers (decision 20), so one worker
4 ms, two 2 ms, three 1.33 ms, and from four on 1 ms, as before. The
frames come late, for this, when their period, eased over the frames, is a
quarter or more longer than the screen's own; a frame dropped now and then
does not count. Where the frames come on time, nothing changes.

**Why.** The author asked, once decision 51 was published, to treat what it
did to a device with few cores whose frames come late, such as one that
draws without a GPU: with one worker taking 1 ms, a quarter of the main
line's time, the published page on this machine carried 67 to 174 twins in
the default view, against 256 to 365 before the workers. A device with
four cores or more already gave the twins at least 4 ms in all, and is
left as it was.

**Evidence.** Unit tests: the frames come late at 30 and at 10 frames a
second on a 60 Hz screen, and not on time at 60 or 120 Hz, at 50 a second,
or with one frame in ten dropped; a worker's budget is the frame's free
time from 1 ms to 10 ms, the least in a busy frame whose frames come on
time, and, while they come late, at least 4 ms shared by the workers and
never less than 1 ms each. In headless Chromium on the machine of decision
5 (two cores, drawing on the CPU, so one worker), at 1280 × 720, two runs
each, the page before the workers, as published with decision 51, and with
this one: in the default view 256 to 365 twins at 8.6 to 10.6 frames a
second, 67 to 143 at 13.2 to 13.4, and 311 to 370 at 8.3 to 9.1; with
4 096 asked, 206 to 440 at 7.5 to 11.4, 73 to 194 at 11.7 to 13.8, and 155
to 340 at 9.0 to 10.4; with 8 masses, 102 to 108 at about 12.6, 10 to 28 at
about 18, and 29 to 41 at about 15; with 16 masses, 19 to 33, 5 to 6, and
9 to 19. With two masses the twins and the frames are back to what they
were before the workers. With more masses they stay fewer: on this
machine's two cores, which the worker shares with the browser's drawing,
the same 4 ms carry fewer twins in a worker than they did on the main line.

## 53. Controls that did two things are split, and the trails' control is how long they last

*2026-11-18.* Three of the first piece's controls each did more than one
thing, and are split. This replaces the steps that decision 50 added to two
controls, the pips of decision 22, and how the switch of decision 35 and the
scale of decision 41 show in the row.

- **The trails** (keys 7 and 8, until now "Length of the trails") are how
  long the trails last: the half-life of their light in seconds of
  simulated time, off, 0.5, 1, 2.5 and 10 s, then the step that leaves a
  mark (decision 42) and the one that stays. The control shows the seconds,
  and the last two steps in words, rather than pips, which showed the
  strobe's step as longer than ten seconds when its copies faded in one. A
  new control, the trails' style, draws them as lines, as before and as the
  piece opens, or as a strobe's (decision 50), on Shift with 7 and 8. A
  strobe's copies now fade as the trails' half-life says, and with the step
  that leaves a mark they leave one.
- **The twins' P,** which went round stay, fade and dust, says whether they
  stay or fade. A new control, the twins' look, draws them as chains or as
  dust, on Shift and P. Twins that fade can now fade as dust, a plume of
  sparks.
- **The tension's colours,** a switch among the actions (T) and a scale
  among the colours (Y), are one control in the row: off, then each scale,
  coming round. The T and the Y work as before, and the address keeps the
  switch and the scale apart, as it did.

A key held with Shift is read by where it is on the keyboard rather than by
what it types, so that it is the same key on any layout; a key with nothing
of its own held with Shift does what it types, as before. A saved moment's
code gets its sixth version, a byte longer. A code of the fifth, saved on
the published page, opens as the same screen, its strobe's trails as trails
of a second drawn by a strobe and its dust as twins that stay drawn as
dust, and so do readable addresses with `trail=50` or `fade=2`. The two new
controls' icons are placeholders until the author chooses among candidates
drawn for them.

**Why.** The author asked for a map of the controls: how to group them,
which ones mix functions and how to separate them, and which can be misread.
He named one case: the trails' "length" is about how long they last, and it
hid the strobe, which did not belong there. Of the separations proposed
(the trails' duration and style; duration, style and mark; or a new name
alone; for the twins, life and look, or a new name alone), he chose the
first of each, and Shift with the same key for the new controls, since the
only free letters were F, kept for full screen, and Z and X, kept for a
zoom. The tension as one control belongs to the grouping he chose to try
next, where it sits with the chain it paints.

**Evidence.** Unit tests: the trails' steps and their words, the style, the
twins' life and look, the tension's control with its keys and its colours
off; a key held with Shift found by where it is, and Shift and P told apart
from P with caps lock on; the sixth code holding both new controls; a code
of the fifth saved on the published page, and the published page's readable
addresses, opening as the same screen; the title's words. The browser tests
step through the trails' keys, the P key and the tension's control with
their new keys.

## 54. The controls in two levels: the pause, the light and six groups

*2026-11-18.* The first piece's row of controls has two levels. This
replaces the one row of decision 31, in which every control sat in sets;
the button in the corner, the value right above its icon, and the keys
stay as they were.

- **The first level** holds eight icons: the pause and the light switch,
  which act on the whole piece, then six groups. On a phone up to 400 px
  wide its icons sit 36 px apart instead of 40, so that the eight fit
  beside the button without scrolling, down to 360 px.
- **A group's icon** opens the group's own row right above it, centred on it
  and kept on the screen, and shuts it. Time and the start: start again,
  save the moment, where the chain starts and the amplitude of a mode, time
  backwards, and how fast time runs. The chain: its masses, the hand,
  gravity's strength and direction, the shake, and the tension's colours.
  The twins: how many, how far apart they are born, whether they stay or
  fade, how they are drawn, and their palette. The trails: how long they
  last, their style, and which masses draw them. The screen: the ground,
  the sketch's light, which now has a button (decision 24), sharing the
  address, and its QR code. The music's icon opens its card, as before.
- **What was open comes back.** The row, its open group and the value open
  in it stay as the visitor leaves them while the controls fade. Shut by
  the button and opened again, the row opens the group and the value that
  were open, and each group keeps the value last open in it. With the row
  open, a key opens its control's group and shows the value there; with the
  row shut, it shows the value alone above the button, as before. Escape
  shuts the open group, then the row.
- The groups' icons are placeholders until the author chooses among
  candidates drawn for them: an hourglass for time, the corners of a frame
  for the screen, and for the chain, the twins and the trails the icons of
  their first controls.

**Why.** The author asked how the controls could be grouped for a visitor,
which should always be on the screen, which mix functions and which can be
misread (decision 53). Of three layouts drawn for him (one row regrouped,
two levels, or a few controls and a card with words) he leaned to two
levels, and asked first to keep the twins apart from the trails, to say
where the strobe and the dust go, and to give the colours a place by what
they colour; then that a visitor should not have to click again to reopen
what he was using when the row fades. The strobe went to the trails and the
dust to the twins; the palette to the twins, the tension's colours to the
chain, and the ground and the sketch's light, which belong to the whole
picture, to a group of the screen, where a zoom, full screen and a
wallpaper can go later. He chose the light switch on the first level, since
it acts on two groups, and that everything comes back as it was left. While
the row is shut, only the button in the corner shows, as before.

**Evidence.** Before this, a phone 390 px wide showed 7 of the row's 25
icons, all actions, with the music and every control of the chain about
three screens of scrolling away. In headless Chromium at 1280 × 800: the
first level; a group's row above its icon, and a value above that; a key
that leads the row to its group and shows its value; the row shut and
opened again with its group and its value; Escape shutting the group. At
390 and 360 px wide the eight icons of the first level fit beside the
button without scrolling.

## 55. Published at the author's subdomain

*2026-11-18.* The site is published at <https://pendulum.rafasouza.dev.br/>,
the subdomain decision 12 chose, over HTTPS only. This replaces the address
of decision 14; the rest of decision 14 stands. The old address,
<https://rafa-el-souza.github.io/pendulum/>, forwards to the new one with the
settings and the saved moment it carries, so links shared before keep
working.

**Why.** Decision 14 kept the GitHub address only until the subdomain's DNS
records were in place; they now are.

**What follows.** Nothing in the build changes: every URL in it is relative
(decision 7), and sharing and the QR code take the page's own address
(decision 40).

**Evidence.** In headless Chromium, the old address led to the new one with
readable settings (`?twins=4096&n=8`), with a saved moment's code, and by
way of the first piece's own address (`chain-in-hand/`, decision 30);
`http://` led to `https://`. The page raised no errors.

## 56. The start says when it is a saved moment, and a value with nothing to do shows faint

*2026-11-18.* Two changes to how the first piece's row shows where the
chain starts and what has no effect. This replaces, in decisions 33 and 34,
the start and the amplitude shown held back in the hand's blue, and
choosing another start as a way to forget a saved moment.

- **The start** (keys N and M, until now "Normal mode") is named Start and
  shows side, mode 1 to mode 4 and, while a moment is saved, saved: where R
  starts the chain again. With a moment saved, the start's − or + forgets
  it and goes back to the start the control had before, rather than on to
  the next. Another number of masses, or the amplitude of a mode, still
  forgets it. The address and a saved moment's code are as they were.
- **A value with nothing to do now** shows faint, its icon in the row and
  the value above it, and can still be chosen: the amplitude while the
  chain starts raised or from a saved moment, and which masses draw the
  trails while a strobe's stamp the whole chain. The hand's blue is left to
  a value held below the one asked for, as the number of twins and the
  speed of time are when the machine cannot keep up (decision 20).

**Why.** Mapping the controls (decisions 53 and 54) showed two things the
row did not say: R started again from the start chosen or from a saved
moment, without showing which, and the blue meant both "fewer than asked
for" and "no effect now". After an explanation of R beside the rewind
planned for later, the author chose that the start shows "saved" and that
its first step returns to the start before; he chose the words and the
faint tone from candidates drawn side by side.

**Evidence.** Unit tests: the start's name and words, and "saved" kept
outside its steps. Browser tests: the amplitude faint with the chain raised
and not in a mode; after S, the start saying "the moment saved" and the
amplitude faint; the start's first step forgetting the moment, the address
losing its code, and the start raised to one side; the next step choosing
mode 1; which masses faint with a strobe's trails and not with lines.

## 57. The row's icons and names, chosen from candidates

*2026-11-18.* The first piece's row takes the icons the author chose from
candidates drawn side by side at the row's size, in its real order, and
names a visitor reads. This replaces the placeholder icons of decisions 53
and 54, and the icons and words of decisions 25, 27, 28, 31 and 33 named
below.

- **The button** that opens the row, a little chain since decision 31, is
  drawn swung a little from its pivot, its rods visible and its tip the
  heaviest, since three equal dots read as "more". It still swings to lie
  along the row.
- **The groups:** time and the start, a clock; the chain, the chain of its
  masses' control; the twins, a butterfly, for the butterfly effect they
  show; the trails, the comet of their duration; the screen, a monitor,
  since the corners of a frame mean full screen, which may join that group
  later.
- **The light switch** is a light bulb, filled while lit and outlined while
  out, named "Light of the twins and trails", since a sun read as
  brightness or a theme, and "light" also names the sketch's light.
- **Time and the start:** start again is a bar with a triangle pointing
  back to it, as players go back to the start, since a circling arrow read
  as reloading the page; time backwards is one triangle pointing back,
  outlined while time runs forwards and filled while it runs backwards,
  since two read as rewinding fast, and two are kept for a rewind; the
  start is a chain raised to one side, its rest faint, since a standing
  wave read as ∞.
- **The controls of decision 53:** the trails' style is a line going on as
  dots; the twins' look, a cloud of points; the tension's colours keep the
  spring balance.
- **How close the twins are born** (keys 3 and 4, until now "Spread of the
  twins at birth") shows the fan's width at the tip of the chain, a metre
  long, held straight, as they are born: from 1 nm to 10 cm, 1 mm where the
  piece opens, rather than the angle as a power of ten. The page's title
  says it the same way; the address keeps the angle.

**Why.** The author chose every icon and word from some forty-five
drawings in three rounds, each shown large and at 18 px between its
neighbours in the row. Drawings that read as something else were dropped
before he saw them: a dial on a hook read as an umbrella, a picture on a
nail as a house, Newton's cradle as "Π", and a chain hanging from a ring as
a telephone.

**Evidence.** Unit tests: the start's and the style's icons, how close the
twins are born at each of its nine steps, and the title's words. Browser
tests find the light switch and the spread by their new names. Screenshots
of the first level and of each group's row, 1280 and 390 px wide, in
headless Chromium.

## 58. The twins open fading

*2026-11-18.* The first piece opens with the twins that fade (decision 43),
and P still lets them stay. This replaces, in decision 43, the twins that
stay as the piece opens.

- **The readable address** writes `fade=0` for twins that stay, and nothing
  for twins that fade, so an address written before without `fade=` now
  opens with the twins fading.
- **A saved moment's code** opens as it did: codes of versions 4 to 6 hold
  the choice, and codes of versions 1 to 3, written before the twins could
  fade, open with the twins that stay, as they were published.
- **The page's title** names twins that stay, rather than twins that fade.
- **The README's picture of the fan,** taken six seconds in with the twins
  staying, is kept: at that moment the two differ little, the paths a
  little brighter while the twins fade. Its animation already shows twins
  that fade.

**Why.** The author asked for the twins that fade as the way the piece
opens, and judged the README's picture too close to the new opening to be
taken again.

**Evidence.** Unit tests: the control opening at fade; the readable address
with and without `fade=0`; a code of each version without the control
opening with the twins that stay; the title's words. Browser test: the
piece opening with the twins fading, Shift and P drawing them as dust, P
letting them stay and fade again, and the address and the title following.

## 59. The button is a pendulum, and it swings where it hangs

*2026-11-18.* The button that opens the first piece's row is drawn as a
pendulum: a bar, a string and a heavy bob, swung to one side over the faint
arc of its swing. As the row opens or shuts, the string and the bob swing
out to the other side about the pivot and back, losing their swing, to hang
where they were, while the bar and the arc keep still; with reduced motion
asked for, the button does not move. This replaces, in decision 57, the
little chain swung from its pivot, and its turn to lie along the row.

**Why.** On the site, the author found that the little chain did not read
as a pendulum: without a support, and with masses of about one size, it
read as a line of beads. He chose this pendulum from four drawn side by
side at 18 px, closed and beside the row: with the arc, a bar, string and
bob read as something that swings rather than as a "T". Turned 90° to lie
along the row, none of the four read as a pendulum; raised to the side, the
pendulum read as a pin, and swung to rest on the other side, as a musical
note beside the music's icon. He chose that it hang and swing.

**Evidence.** Frames of the swing on the built page, every 75 ms of its
900, and a recording of the row opening and shutting at 640 and 390 px
wide, in headless Chromium. The browser tests open and shut the row as
before.

## 60. The browser tests run in Playwright's own image

*2026-11-18.* In CI, the web job runs in Playwright's image of the version
the tests use (`mcr.microsoft.com/playwright`, on Ubuntu 24.04, pinned by
its digest), which carries Chromium, Firefox and WebKit, their system
packages, and Xvfb for Firefox's virtual display. The step that installed
the three browsers and their system packages through apt goes. The sound
server of decision 44 is still installed through apt, since the image lacks
it: nine packages, 2.2 MB, after 34 MB of package lists. The image runs as
root, so Firefox is given root's home, and Chromium shares the host's
memory, as Playwright advises. A unit test holds the image's version to the
one in `web/package.json`, so a bump of Playwright that forgets the image
fails before the browser tests do.

**Why.** Ubuntu's package mirror has slowed several times to tens of kB/s.
Installing the browsers' system packages, 185 of them, 125 MB, then took
from 21 to more than 33 minutes, and the web job hit its 40-minute limit
before any browser test ran: twice in a row on the pull requests of
decisions 58 and 59. The image comes from Microsoft's registry instead.
The author chose this over retrying until the mirror recovered, or leaving
the pull requests for a later session.

**Evidence.** The whole browser suite in the three engines, run on this
machine in the same image, with the sound server started as the step
starts it: 174 tests passed and 3 skipped, as in CI, in 15.2 minutes, on
the code of decisions 58 and 59. The unit test of the image's version, red
before the workflow named the image.

## 61. Dense light can keep its colour

*2026-11-19.* The first piece's group of the twins has a control after the
palette, "When dense light turns white", on Shift with the palette's keys,
in four steps: at once, late, later and never. At once is the piece as it
was: the twins are drawn straight onto the canvas, which cuts each colour
channel at full, so that where many twins share a pixel their light turns
white in any palette, and the trails go through 1 − e^(−x) channel by
channel (decision 21). At the other steps the twins are drawn into a target
of their own, of half floats, and they and the trails go to the canvas
through one curve: the brightness of the brightest channel, 1 − e^(−m), in
the colour of the light added, with white coming in as 1 − e^(−m/w), w being
40, 150 and without end. A faint twin looks as it did. The piece opens at
later. This changes, in decision 21, the curve the trails go through at
every step but at once.

- **The control** is a drop of colour, half full, and its value five dots
  of the palette's middle colour as 4, 16, 64, 256 and 1 024 twins add it
  in one pixel, each as bright as one of the 512 the piece opens with,
  through the same curve, so that the dots show the palette chosen; a
  screen reader hears the step in words.
- **The readable address** writes `white=` for every step but later, so an
  address written before without it now opens keeping the colour.
- **A saved moment's code** is in version 7, which holds the step after the
  palette; codes of versions 1 to 6 open at once, as they were published.
- **A browser that cannot draw into half floats** has eight bits there,
  which cut the light at full as the canvas does: there the light turns
  white at once at every step, and the control shows faint.
- **The page's title** names the steps but later: "colours that whiten at
  once", "colours that whiten late", "colours that never whiten".
- **The cost** is one target the size of the frame, cleared and drawn into
  every frame, and read in the pass that shows the trails. Without a
  graphics card, in headless Chromium, the frame takes about an eighth
  longer than before with the twins as chains and a third longer as dust.
  With a graphics card it was not measured.
- **40 and 150** are the session's placeholders for the author's eye; 150
  is the one he saw.

**Why.** In the author's settings (the blossom palette, 4 096 twins, time
at a tenth), the fan that keeps out of chaos for long was a white band with
pink edges. Each of 4 096 twins adds a twentieth of its colour, and on the
blossom palette the red channel fills with about 20 twins in a pixel, the
blue with 36 to 46 and the green with 28 to 114, so the dense middle turned
white. He saw this as a prototype beside a wider fan and twins held near the
chain, kept all three, and chose that this one be a value beside the
palette, opening keeping the colour, with addresses without it opening so
too.

**Evidence.** Unit tests: the curve channel by channel at once, otherwise
the colour kept and white coming in the later the more light it takes, and
faint light shown as it was added; the control's steps, keys, words and
dots; the code of version 7 and the older codes opening at once; the
readable address with and without `white=`; the title's words. Browser
test: Shift with the palette's keys stepping the white, the dots painted,
white at once and in the palette's colour never, another palette painting
them again, and the address and the title following. Captures of his
settings at 2, 5 and 9 seconds, the same motion at each step.

## 62. Passes over the whole frame are cut to the chain's reach

*2026-11-19.* Every mass, twin and trail of the first piece stays within the
chain's length of the pivot, at the centre of the frame, and its glow within
52 CSS pixels of that: three spreads of the rods' widest halo, with the
music at its most, and a pixel for a line's edge. The passes that go over
the whole of a target, the trails' fade, the clear of the sketch's scene and
the show of the trails through their curve, are cut to the box round that
disc, with WebGL's scissor; about 55% of the frame at 1280 by 720 pixels,
and as much on a phone. The canvas's own clear, and the chain, the hand's
spring and the dots drawn straight onto it, are not cut. With the sketch's
light on and the hand holding the chain, the spring goes through the scene
wherever the hand is, and the passes stay whole.

**Why.** Where the browser draws without a graphics card, as CI's three
browsers do, a frame is nearly all passes over every pixel. The twins'
target of decision 61 added more of them, and the browser tests took 31 to
45% longer; three that count frames went past their 30 seconds. Of the
changes a survey of the frame's drawing measured, the author chose this
one, which leaves the screen as it was, to come first. Two are kept for
later: the trails' fade kept as a number instead of a pass every frame, and
a canvas without multisample antialiasing, which changes the screen a
little.

**Evidence.** On paused pages read back whole, with the passes cut and
whole: 0 pixels differ, with the twins as chains and as dust, the sketch's
light, the trails' mark, the strobe, and on a phone's canvas of 1170 by
2532. Frames a second in headless Chromium without a graphics card, the
same build with the passes whole and cut, medians of three rounds: 10.1 to
15.6 with the twins as chains and 15.1 to 22.9 as dust at 1280 by 720, and
20.2 to 30.8 at 390 by 844. Unit tests of the box: centred, cut at the
canvas's edges, and holding every point within the reach.

## 63. The twins can be born round the pivot, to a whole turn

*2026-11-19.* The first piece's spread (decision 25) goes on past ten
centimetres at the tip: 15°, 45°, 90°, 180° and 360° round the pivot, on the
same keys, 3 and 4, and the same place in the address. Twins born that far
apart are no longer twins of one motion: each is the chain turned whole by
its share of the fan, with an energy of its own, and at 360° they are a
flower of chains round the pivot. The control is now "How far apart the
twins are born" (decision 57 named it "How close the twins are born"); its
value shows the fan's width at the tip up to ten centimetres, then the
fan's angle, "90°", and a screen reader hears "90 degrees round the pivot".

- **Twins that fade** measure how far chaos has carried them from where
  they were born: the light of decision 43 falls with how far the twin
  looks from the chain now, against how far it looked as it was born. A
  twin born turned by an angle θ from its chain moves each mass along a
  chord of its circle round the pivot, so the two look 2 |sin(θ / 2)| times
  the root mean square of the masses' distances from the pivot apart. Up
  to ten centimetres that is under a twentieth of the chain's length, and
  the fade looks as it did; without it, a twin born across the pivot would
  open dark.
- **The music's fan** (decision 49), which widens the spread by ten to the
  power the music asks, stops at a whole turn.
- **The readable address** writes the new steps in short radians,
  `spread=0.26` to `spread=6.28`, which are the control's values
  themselves, so that an address carries them exactly; 6.28 is a hair
  under a whole turn, and the fan's two edges all but meet.
- **A saved moment's code** is in version 8, which holds the new steps;
  codes of versions 1 to 7 open as they were published.
- **The page's title** says "born across 90°" for the new steps.

**Why.** In the author's settings, the twins that keep out of chaos for
long stay a narrow band along the chain. Asked what could be done with
them, the session brought ten options; he chose three to see as
prototypes, the light that keeps its colour (decision 61), this wider fan
and twins held near the chain, kept all three, and chose that the wider fan
go on the control there was, in degrees after ten centimetres, without a
new key.

**Evidence.** Unit tests: the spread's steps, name, values shown and words;
the distance at birth equal to the one measured between the chain and its
twin, for spreads up to a whole turn; a twin's light measured from it; the
music's fan stopping at a whole turn; the code of version 8 and the codes
of version 7; the readable address with the new steps; the title's words.
Browser test: the key 4 stepping past ten centimetres to 360°, the address
and the title following. Frames a second in headless Chromium without a
graphics card, the branch and the main it starts from in turn, at 1280 by
720: medians of six rounds with the twins as chains, 8.0 on both, and of
nine as dust, 7.7 on main and 7.9 on the branch, single rounds ranging from
6.8 to 9.5; on the branch at 90° and at 360°, 7.9.

## 64. The twins can be held near the chain, or leashed to it

*2026-11-19.* The first piece's P key (decision 43) goes round four lives of
the twins instead of two: stay, fade (as the piece opens, decision 58), held
and leashed. The control is now "Life of the twins" (decision 57 named it
"Twins stay or fade"). A new control after it, "How near the twins are
held", says how near: 5, 10, 20, 30 or 40 cm on a chain a metre long, as
the spread's width at the tip (decision 57), opening at 20, on Shift with
the spread's keys, 3 and 4, and shown faint while the twins stay or fade.
Neither new life is in the paper: each acts on the twins alone, once each
frame's time has gone by, and the chain moves as before.

- **Held.** Once the fan grows wider than the control says, measured as
  the root mean square of how far its twins look from the chain, every
  twin is drawn in towards the chain by one factor, the differences of its
  angles from the chain's, the nearest way round, and of its rates alike,
  so that the fan is that wide again. The twins keep the direction they
  differ in, and stay a blade along the direction the motion stretches
  differences in at that instant, which is how Benettin's method measures
  chaos. A fan born wider (decision 63) is held at the width it was born
  with.
- **How often differences double.** How much the held fan grew from one
  frame to the next, averaged over the last three seconds or so of
  simulated time, gives the time a difference takes to double. Once there
  is half a second of measure, for twins born up to ten centimetres apart
  and held within 20 cm, the P's value shows it in two figures, "0.11 s",
  and its title and a screen reader say "Twins held: differences double
  every 0.11 s"; otherwise the value is "held". Twins born again, time
  turned back, another number of masses and another width start the
  measure again.
- **Leashed.** Each twin is free within the control's distance of the
  chain, and past it, what is beyond falls back at 8 a second, each twin
  on its own. The slack sets how small the cloud gets; the pull, against
  how fast chaos parts the twins, whether it swells and shrinks (near it),
  stays the size of the slack (far above it) or is all but free (below
  it).
- **Where they act.** In each worker's share of the twins (decision 51),
  with the chain as it is once the frame's time has gone by, which the
  frame's command now carries. What a share sends back is where its twins
  got to on their own, and the next frame starts from where they were
  drawn in to. Each share holds its own twins by its own factor, and each
  share's twins are spread over the whole fan (decision 51).
- **The readable address** writes `fade=3`, `fade=4` and `hold=`, the last
  only when it is not 0.2; `fade=2` is still the dust of addresses written
  before decision 53.
- **A saved moment's code** is in version 9, which holds the two new steps
  and how near, after the twins' life; codes of versions 1 to 8 open as
  they were published.
- **The page's title** says "twins held" and "twins leashed", and "within
  30 cm" while they are held or leashed at another distance than 20 cm.
- **The control's icon** is a line with two brackets closing in on it,
  chosen from six candidates drawn in the twins' row.
- **The 20 cm it opens at and the leash's 8 a second** are placeholders for
  the author's eye; the leash he saw as a prototype had 15 cm of slack.
- **The number** is measured once a frame. Out of the page, with three
  masses let go from the side under Jupiter's gravity, at a tenth of real
  time, a lens of 20 cm reads 0.21 s over the first simulated second and
  0.10 to 0.11 s from the fifth on, where the same measure with a lens two
  hundred times narrower reads 0.10 s; at real time, 0.11 to 0.13 s at 60
  frames a second and 0.11 to 0.15 s at 30. Over 40 simulated seconds,
  lenses of 5, 20 and 50 cm read 0.103, 0.111 and 0.251 s: differences
  that are no longer small stretch more slowly, which is why the number
  stops at 20 cm. Frames that each simulate more time, on a slow device
  or with time sped up, let the fan grow further between them, and read
  longer too. Two masses under Jupiter's gravity double their differences
  every 0.2 to 0.3 s, and under the Earth's, as the piece opens, every
  0.34 to 0.36 s.

**Why.** In the author's settings, the twins that keep out of chaos for
long stay a narrow band along the chain, and those that fade come and go.
Asked what could be done with them, the session brought ten options; he
chose three to see as prototypes, the light that keeps its colour (decision
61), the wider fan (decision 63) and twins held near the chain, kept all
three, and chose that the held twins be a third step of the P, with the
lens's number under its icon. Of a second round of prototypes he chose the
leash, as a fourth step, in the same slice. Seeing them built, he asked
whether the fixed numbers were worth varying; shown what the lens's width,
the leash's slack and its pull each do, side by side in his settings, he
chose one control for how near, with the pull fixed, in this slice.

**Evidence.** Unit tests: a twin drawn in by a factor, its angles the
nearest way round and its rates; the fan's width as a root mean square, and
as it is born; the leash within and past the slack; the measure of the
doubling, its half second, its forgetting over three seconds, and nothing
while the fan does not stretch; a share's twins held exactly as a free
share's drawn in by the lens's width over the fan's, or left alone while no
wider; the stretch reported from the width after the last command, and
none after an event; each twin leashed exactly as the free one drawn in by
the leash's factor; nothing held over a command of events alone; the P's
steps and words; the control's steps, keys, words and icon; the number in
two figures; codes of versions 9 and 8; the readable address with
`fade=3`, `fade=4`, `hold=` and the dust of `fade=2`; the title's words.
Browser tests: P from fade to held, its number said whole and in its title
within seconds, gone past 20 cm, on to leashed and stay, the control faint
and lit with them, the address and the title following; P going round with
the twins as dust. Out of the page, the number over a minute of simulated
time at four widths of the lens and three lengths of frame, and the
leashed cloud's width over 40 seconds for slacks of 5, 15 and 40 cm and
pulls of 2, 8 and 32 a second, with three masses under Jupiter's gravity
and two under the Earth's; in the page, the number with two and three
masses. Frames a second in headless Chromium without a graphics card,
three masses at four times real time, at 1280 by 720, medians of six rounds
alternating: on main with the twins that stay, 6.2; on the branch, 7.3
with them staying, 7.0 held and 7.1 leashed; single rounds ranged from 3.1
to 9.9.

## 65. What of the chain is drawn

*2026-11-19.* The first piece's group of the chain has a control after the
tension's colours, "What of the chain is drawn", on Shift with the masses'
keys, ↓ and ↑, coming round, in four steps: whole, as the piece opens,
rods, masses and none. Everything else is drawn as before, from where the
chain is: the twins, the trails, the strobe's stamps, the hand's spring and
the pivot; and the chain moves as before. Hidden rods show only while the
music lights them: as bright as its light on the kicks makes them (decision
46), up to how bright they are drawn, with their halo, and not at all in
silence.

- **The control** is an open eye. Its value is the step's word; a screen
  reader hears "the whole chain", "its rods alone", "its masses alone" or
  "none of it". Beside it the keys read "Shift ↓ ↑"; the masses' keys
  without Shift step the masses as before.
- **The readable address** writes `chain=1`, `2` or `3`, and nothing for
  the whole chain.
- **A saved moment's code** is in version 10, which holds the step after
  the ground; its first part takes fifteen bytes instead of fourteen, and
  codes of versions 1 to 9 open with the whole chain.
- **The page's title** names the steps but the whole: "rods alone",
  "masses alone", "chain hidden".
- **What was hidden before:** the masses of rods shorter than 12 pixels
  are not drawn, so "rods" changes only short chains. With the light put
  out (decision 27) and none of the chain, the pivot alone shows. With the
  rods hidden, the tension's colours (decision 35) show only in what is
  still drawn: the masses, the trails and the strobe's stamps.
- **Other ways the music could show hidden rods,** seen as animations and
  not chosen: only the light it adds to the halo, a faint smoke with beads
  at the joints; the same in the music's glow mode, a thick blur; and the
  whole halo without the line, always, a ghost that never goes.

**Why.** The author asked whether the circles and the segments could be
hidden while every effect stays in sight, as a clean switch. Seeing a
prototype as animations, he chose the four steps and the rods lit by the
music; then the name and the words, the keys, the place last in the
chain's group and `chain=` in the address, from the session's
recommendations, and the eye from seven icons drawn at the row's size,
where the eye crossed out would say hidden of the chain the piece opens
with, and the half-faint pendulums read as the masses' and the shake's
icons.

**Evidence.** Unit tests: the control's steps, keys, words, icon and
coming round; which steps draw the rods and the masses; arrows held with
Shift shown as arrows; codes of versions 10 and 9; the readable address
with `chain=` and without; the title's words. Browser test: Shift and ↑
going round the four steps and Shift and ↓ back, the address and the title
following, and ↑ alone stepping the masses. Captures of the row at 390 px
and at desktop width at each step; animations of six seconds with the demo
beat and eight masses, the masses alone and none of the chain, with and
without the twins and the trails. With the whole chain, a frame draws what
it drew before.

## 66. The trails are carried to the canvas's new size

*2026-11-20.* When the canvas changes size, as a phone turns, a window is
resized or goes full screen, or the browser zooms, the trails and their
mark (decision 42) are carried to the new size instead of cleared. Each new
pixel reads the old image where it saw the same point of the world, and
holds the light a line drawn there anew would have: the old light times the
old scale over the new. Where the canvas grows or only slides, a pixel
reads the sixteen old pixels round that point, which keeps lines sharper
than four; where it shrinks, the mean over the area it covers. Lines drawn
before still come out wider in a larger canvas, so a canvas grown more than
a quarter past the smallest size its trails were drawn at, over one change
or several, clears them instead, and they start again. While a window's
edge is dragged, the image is held as it was when the drag began and every
change is read from it, so that the trails are resampled once, not once a
frame; while a drag lasts, the trails are drawn twice.

**Why.** Cleared, the trails were lost whenever a phone turned; read from
the frame before, a drag blurred them; read from four pixels, a larger
canvas softened them more; past a quarter larger, they read as wide, soft
bands beside the new ones.

**Evidence.** Unit tests of the view, the carry, the weights of the sixteen
pixels and the runs of changes, cleared past the limit over one run or
several. A browser test, in the three engines, in which the trails keep
their light through a smaller canvas and a drag, and are cleared in one
twice as large. After a drag of 60 frames, the trails are identical to
those after one change. Against trails drawn anew at the new size, carried
trails keep 93% of their sharpness in a canvas 1.1 times larger, 84% at 1.5
times and 71% at twice (85%, 76% and 64% read from four pixels).

## 67. The view comes up to 64 times nearer

*2026-11-20.* The view comes up to sixty-four times nearer than the whole
view, and moves; the piece draws, grabs and cuts its passes in the view
seen. The wheel, and a trackpad's pinch, zoom about the mouse, Z and X 1.25
times about the middle, and two fingers on a touch screen zoom and move it;
the middle button, or a drag with Space held, moves it, and Space pauses as
it is let go, unless it moved the view. The point it looks at stays within
the disc the chain reaches, at most 1 - 1/zoom of the chain's length from
the pivot, so the whole view always looks at the pivot. Once the view
stays, the address carries it beside the music, outside a saved moment's
code: `zoom=8&at=0.12345,-0.85432`, nothing at the whole view. One finger
waits 120 ms, or until it has moved 10 CSS pixels, before it grabs the
chain, so that a second can land and pinch; two never grab, and a finger
lifted within the wait grabs nothing; while the wait is tried, the address
can ask for another (`?wait=200`). The trails keep decision 66's limit with
the camera too: carried while the view is at most a quarter nearer than
the least scale they were drawn at, cleared past it. A view that moves or
goes farther carries them, held anew as it sees past what is held, and
moves them by whole pixels. While the view changes, and for the next frame,
the twins' workers keep their budget: those frames teach neither the
screen's rhythm nor a twin's cost, and three of them over it cut nothing.

**Why.** Stretched from the whole view, trails read as stepped, soft bands
at four times nearer and a blur at sixteen. The first finger grabbed at
once and ended the twins, so no pinch could begin. A gesture's slow frames
shrank the twins' budget and cut the fan for good where twins stay, are
held or are leashed.

**Evidence.** Unit tests of the camera, its bounds, zooming about a point,
the drag, the pinch, the address, the finger's wait, the runs of a gesture
and the twins' budget. Browser tests, in the three engines: the wheel, Z
and X; an address that opens near, and the middle button; Space; two
fingers, and one that waits; trails carried a quarter nearer and cleared
past it. Against the same moment drawn anew at the new zoom, trails
stretched from the whole view keep 76% of their sharpness at twice, 55% at
four times and 22% at sixteen. Without a graphics card, at 1280 by 720
(medians of six rounds taken in turn), 10.8 frames a second at the whole
view against 11.1 before, 10.9 held at twenty times, and 7.2 during a
gesture of the wheel, which reads the trails anew every frame.

## 68. Trails kept as curves, behind the address

*2026-11-20.* With `?trails=sharp` in the address, the recent trails are
kept as curves and drawn anew in every view, as fine as when they were
drawn; without it, the piece is as before (decisions 66 and 67). Each trail's
samples, with their velocities, are joined into spans of cubic curves that
pass within 1.5 µm of every sample they skip, and each span is drawn as a
band, cut into as many straight pieces as its bend in the view asks for. The
image of the trails takes each frame's new spans and, every three half-lives
of fade or 200 000 spans, is copied with the view it saw. When the view
changes, it is remade from the older copy, read from its view and faded
since, from a coarse image of the whole disc where that copy did not see,
and from the spans since. The fade is kept as a number, and each span keeps
the fade at its ends rather than the time, so that its light holds as the
half-life changes. A strobe's trails, a mark, and browsers without half
floats go on as the image carried. With `?fps=1`, a meter in a corner shows
the frames a second, the last remake's cost, which of the two draws, and the
memory the curves take.

**Why.** Carried nearer, an image's lines come out wider, and past a quarter
nearer they are cleared; drawn anew, the recent trails keep their width up
to sixty-four times nearer. The address keeps the curves a trial until their
cost is known on devices with a graphics card, which the meter measures.

**Evidence.** Unit tests of the curves and their merger, the window of
spans, the clock, the copies and the meter, and of the twins' tip velocities
against their motion. Browser tests, in the three engines: the trails stay
through a view 1.56 times nearer and a canvas twice as large, and come back
as they were; a strobe turns the meter to the image carried. After several
copies, with twins and a fade, a remade image holds the light of the image
kept frame by frame to 0.01%. Without a graphics card, at 1280 by 720, the
piece without the address draws as many frames a second as before.

## 69. Light that has faded no longer counts against the limit

*2026-11-20.* The limit of decisions 66 and 67 counts only light that has
not faded away: a scale the trails were drawn at stops counting once the
light drawn there has faded three half-lives since the view left it, counted
by the fade the trails take, which their length and the music's linger set.
Trails that stay, and a mark, never fade, so every scale they were drawn at
still counts. A view exactly a quarter nearer is within the limit however
its scale rounds. Kept as curves (decision 68), the light from before the
older snapshot, read from the snapshot or its coarse image, is read only
into a view at most a quarter nearer than they saw, and comes back as the
view goes farther; the spans since are drawn anew as before.

**Why.** The limit kept the least scale the trails were drawn at until they
were cleared, so light long faded cleared the trails drawn since: Z pressed
once a minute cleared them every other time. Z after Z rounded past a
quarter at some zooms. Read nearer, the light from before the snapshot came
out in wide, soft bands under the fine lines.

**Evidence.** Unit tests: Z pressed once a minute, the trails fading
between, carries them every time, and trails that stay are cleared every
other time, as before; a scale counts until it has faded the half-lives
asked; nothing is forgotten while a mark keeps light; a gesture past the
limit clears however long it lasts; a canvas grown twice, faded between,
carries; a view a quarter nearer is within the limit at 24 zooms a quarter
apart; the half-lives of a fade; a snapshot read nearer. A browser test, in
the three engines: Z, the trails left to fade, then Z again carries them,
and clears them with a mark. At the opening, side by side, Z pressed every
18 s carries the trails at every press, and every 14 s too; before, every
other press cleared them.

## 70. The curves can keep more, and a snapshot keeps all its light

*2026-11-20.* With `?trails=sharp`, the address can ask the curves to keep
up to twenty times as many spans before a snapshot (`?keep=10`), with as
many times the room on the graphics card, and keeps that beside a saved
moment; with `?fps=1`, the meter also says the seconds of motion the curves
keep. While the image lacks light from before the window, left out because
the view is more than a quarter nearer than the snapshot or its coarse image
saw (decision 69), the next snapshot waits for the view to read that light
again; if the window fills first, the snapshot is made again with that
light, read stretched, and the window drawn over it.

**Why.** Where 512 masses draw, the curves kept under two seconds of motion,
so most of the drawing came from the snapshot and went at a quarter nearer;
how much more a device can keep is to be measured on it. A snapshot copied
while that light was left out lost it for good: once it was the older one,
its region went dark in the whole view.

**Evidence.** Unit tests of the address, of when a snapshot is taken and how
it waits, of the window's free pages and when it is full, and of the meter's
line. A browser test, in the three engines, of the meter's line and of the
address kept beside a saved moment. Side by side on the page's clock, 512
masses drawing and the wheel in and out: the dark rectangle where a snapshot
had been taken at six times nearer is gone. With `?keep=10`, the curves kept
11 s of motion after 14 s, the window at 275 MB, against 1.4 s and 40 MB.

## 71. Trails kept as curves are the default

*2026-11-20.* The trails are kept as curves and drawn anew in any view
(decision 68) unless the address asks for layers, `?trails=layers`: the
image carried to each new view (decisions 66, 67 and 69), where a view that
comes nearer clears the light it would stretch and one that goes farther
keeps only what it saw, around which the trails go on. `?trails=sharp` still
asks for the curves. The curves keep ten times as many spans when the
address asks for none (decision 70). A strobe's trails, a mark and browsers
without half floats still go on as layers, and the meter names them so.

**Why.** Kept as an image, the trails were cleared by a fast zoom and cut to
the old view by zooming out; the curves keep both. Layers stay for what they
draw: going farther step by step stacks what each view kept.

**Evidence.** Unit tests of the address, the default window and the
mechanism's name. Browser tests, in the three engines: the trails kept as
curves without the address and as layers with it, named by the meter and
kept beside a saved moment; the tests of the image carried open it as
layers. Without a graphics card, at 1280 by 720, medians of six rounds in
each order: 13.4 and 12.4 frames a second at the opening against 12.9 and
12.7 before, and 59.6 and 59.9 with 4 096 twins against 55.4 and 54.1.

## 72. How far the old light stretches, asked by the address

*2026-11-20.* With the trails kept as curves, the address can say how many
times the light from before the window, read from the older snapshot or its
coarse image, may be stretched before it is hidden: `?stretch=2`, from 1 to
64, which never hides it; without it, a quarter, as decision 69 has it. A
saved moment keeps it.

**Why.** A mouse's wheel step is often 1.27 times, a little past a quarter:
one step hid the drawing older than the window, while Z, a quarter exactly,
kept it. The address lets the stretch be tried before the default is chosen.

**Evidence.** Unit tests of the address and of the light read at each
stretch. A browser test of the address kept beside a saved moment. Where 512
masses draw, one wheel step of 1.82 times nearer gave 1.74 times the light
of the whole view with a quarter, and 2.72 with 2 and with 64.

## 73. The zoom in the screen's group

*2026-11-20.* The screen's group (decision 54) opens on two more icons. The
zoom's, a magnifier with a plus, opens its value as any value does: ×1 to
×64, as the address writes it (decision 67), with its − and + a quarter
farther and nearer about the middle of the screen, as X and Z. The whole
view's, drawn as ×1, goes back to it at once, and is faint while the view
is whole; Shift and X do the same, read by where the key is (decision 53).
With the row shut nothing more shows (decision 31): Z and X show the zoom
above the button, as a key shows the value it changed.

**Why.** The zoom had no control on the screen: only the wheel, a pinch and
keys, which nothing on the screen shows.

**Evidence.** A unit test of the value shown, the address's own from ×1 to
×64. Browser tests: the group's icons in order; the − and + step the view
and the address follows; the whole view faint while whole, lit after a step
and after the wheel, and going back with the address; with the row shut, Z
and X show the zoom alone; Shift and X from an address opened near.

## 74. The physics takes forces from a record of the music

*2026-11-20.* Besides the hand and the shake, the chain's physics takes one
record a frame of what the music puts into it: gravity tilted within the
frame, kicks of the pivot, hands on any masses, a drag in proportion to each
mass, and a thermostat that draws the chain's energy above rest to a target.
Each is a function of the time into the frame, which the chain and its twins
evaluate at every stage of their own steps; the twins are sent the record
with the frame. Nothing gives one yet, and without it the motion is the same
as before, number for number.

The drag, −c m v on every mass in the pivot's frame, changes no tension and
takes c ω from each rod's angular acceleration, exactly (`PH-4`); the
thermostat is a drag with a sign, gain × (E − target) / max(E, floor). A
kick takes the pivot out and back, (1 − e^(−s/a))³ e^(−s/d) of its size over
that curve's height, and enters as gravity in the pivot's frame, as the
shake does (decision 36).

**Why.** The music is to move the chain through forces, within the paper's
equations (decision 46). The twins show chaos only if they feel the chain's
force at the same instant, and they move in fewer, longer pieces than the
chain (decision 20).

**Evidence.** A twin born on the chain, three masses under every force for
10 s: 2.6e-4 of the length apart with the force taken at every stage,
2.4e-2 with it held over each piece. Unit tests: Newton's law with several
hands and the drag; the energy the drag takes; a kick against a pendulum
integrated on its own; the thermostat from above and from below; an empty
record giving the numbers of none; the twins under the record as the loop
would move them.

## 75. The music moves the pivot, or holds the tip

*2026-11-20.* Two candidates of the music card (decision 49) add a force to
the light of "light": **speaker** and **dance**. They keep the music's pace:
a kick lasts as long on the clock at any speed of the piece, so that in slow
motion the chain feels it shorter. No force acts without a source playing,
nor while the piece is paused.

- **Speaker.** Each kick takes the pivot aside, across gravity, and back
  (decision 74's kick, rising over 15 ms and falling over 100 ms of the
  clock), as far as the kick is strong: 4 cm at the middle strength on
  chains of up to three masses, 4 cm × √(3/n) on longer ones. Its drag is
  0.2 per second while the music plays and 2 in its silence.
- **Dance.** A hand of the music with a grip of 12 (decision 18) holds the
  tip. On each kick its target crosses to the other side of the arc the tip
  reaches, in 0.12 s, as far from straight down as 40° times the loudness at
  the middle strength, at most 60°. No drag while the music plays; in its
  silence the target goes back to rest, under the speaker's drag. The
  visitor's hand takes the chain from it, and it takes hold again over a
  second once let go. Its spring is drawn as the visitor's, in the chain's
  colour.
- **The pivot drawn where it is.** The physics runs in the pivot's frame;
  the chain, its twins, their trails and the visitor's hand are drawn from
  where the kicks have taken the pivot at each instant.
- **Time backwards** does nothing while a mode with a force has a source
  playing, or kicks go on, and its button is faded.
- **Reduced motion:** no kicks, and the hand crosses over a second.

The strength's steps multiply the forces as they do the light. The sizes,
times and the grip are placeholders.

**Why.** The music is to act on the chain as a force (decision 46), each
way with its own dissipation. A probe of the physics found the kick sideways
and the hand on the tip the ways that stay bounded: kicks along gravity pull
the rods with 17 to 82 times the weight each beat, and without drag the
kicks pump the fast motions of chains of eight masses or more. Until the
piece follows the beat, the kicks are what the hand can keep time with.

**Evidence.** A kick every half second for 20 s, then 8 s of silence, at
×0.8: the speaker keeps the energy above rest under 0.31 of the energy that
lifts the hanging chain level, on 2 and 8 masses, and the dance under 3.3;
both calm to a hundredth of it within 2.5 s of silence. The hand alone,
without drag in the silence, leaves 16 masses swinging past 10 s. A twin of
two masses costs 1.5 times as much under the speaker (2.75 times without the
pull kept per instant) and 2.5 times under the hand, so that fewer twins fit
while they act. Unit tests: the kicks' sizes, directions and times on the
piece's clock; the drag; the hand's crossings, letting go and taking hold; a
frame cut short; twins stepped one after another by one stepper moving as
each alone, number for number, with the kicks' pull kept for the instants
the next twin meets. In the browser, the modes come in order in the card and
the address, and time backwards is faded and refused while the dance plays
the demo beat, and back with the music off.

## 76. The music's controls in the row

*2026-11-20.* The music card (decision 44) becomes a group of the row, as
the others are (decision 54): its note, or W, opens the music's own row
above it, and shuts it.

- **The sources** are icons in that row: a microphone, a file, the sound of
  a tab or the screen where the browser shares it (decision 45), and the
  demo beat. The one playing is lit, with a dot beneath; touched again, it
  stops. There is no "off".
- **The mode and the strength** are values of the group, opened as any
  value is, with their − and + (decision 46). They have no keys yet.
- **What the piece hears** shows above the group's row, in a value's place,
  while none of the group's values is chosen: a meter of the last three
  seconds with the bands beside it, and what the piece is doing in words;
  before anything plays, "Sound stays on this device."; which microphone,
  where there are several; on an iPhone or an iPad, while the microphone
  listens, that it stops music playing on the device. The loudness in
  decibels is gone.
- **While a source plays,** the note in the first level is three bars that
  rise with the sound's three bands; with reduced motion they stand still
  halfway.

Another group, a value chosen or the row put away takes the music's row and
what it hears out of sight, as for any group; the music plays on.

**Why.** The card sat where a group's row and its value open, and they drew
over it; it stayed in sight when the row was put away; and it was the one
place of the row with words and no − and +. On a phone 390 × 844 it took
256 px, 30 % of the height; the music's row with what the piece hears
takes 84 px, 10 %.

**Evidence.** Browser tests: W and the note open and shut the group; the
demo beat lights, moves the meter and the bars, and stops at a second touch;
what the piece hears sits above the group's row and within the screen at
1280 and 390 px, gives way to a value chosen and comes back, and goes with
another group while the beat plays on; a file, the microphone, a share and a
choice of microphones start and stop from their icons; the mode and the
strength reach the address. Unit tests: the values' words, the mode round
from either end; the bars' heights.

## 77. The music gives the chain energy, or leans its gravity

*2026-11-20.* Two more candidates of the music's group add a force to the
light of "light", after "dance": **breath** and **sway**. As decision 75's,
they act only while a source plays and the piece runs, and time backwards
does nothing meanwhile.

- **Breath.** Decision 74's thermostat draws the chain's energy above rest
  to the loudness times the energy that lifts the hanging chain level, at
  the middle strength, with a gain of 3 a second; in the music's silence, to
  rest. Without gravity, Earth's sets that energy. It lets go while the
  visitor's hand holds the chain and takes hold again over a second. A chain
  hanging at rest has no motion for it to grow: gravity leans 0.01 rad for a
  frame to set it going.
- **Sway.** On each kick gravity sets off to lean to the other side, over
  the time since the kick before (0.25 to 1.5 s; 0.5 s on the first), eased
  in and out, as far as 30° times the loudness at the middle strength,
  × √(3/n) on chains of more than three masses, at most 60°. Its drag is the
  speaker's; in the music's silence gravity goes back to straight down. With
  reduced motion asked for, it crosses over a second at least.

The strength's steps multiply both. The sizes and times are placeholders.

**Why.** The probe of the music's physics found the thermostat holding any
energy within 1% with no drag, and gravity swaying up to 30° bounded under a
light drag. A lean that crosses in 0.12 s, as the hand does, gave a fifth of
the energy in a loud passage.

**Evidence.** The demo beat heard by the page's own analysis, in passages:
the beat, 12 s at −12 dB, 12 s at full again, 8 s of silence; ×0.8, the
middle strength. Under the breath the energy above rest is 0.58 of the one
that lifts the chain level through the beat, 0.42 in the quiet passage and
0.85 in the loud one after it, the same on 3, 8 and 16 masses, and falls to
a hundredth within 2.6 s of silence. Under the sway the tip of two masses
swings up to 55° from straight down through the beat, 41° in the quiet
passage and 114° in the loud one, of eight masses 44°, 34° and 76°, and it
calms within 3.5 s of silence. A twin of two masses costs 2.7 times as much
under the breath and 1.5 under the sway (of eight, 2.2 and 1.3). Taking the
chain's energy once a substep instead of at every stage would cost 2.1
times, but moves a twin born on the chain 2e-4 to 8e-4 of the length from it
in 10 s, against 1e-8: the fan would open without chaos. Unit tests: the
breath's target, letting go and seed; gravity's crossings, their length and
size, its strength kept and its drag; frames cut short; the energy held at
its target and calmed in silence on 2 and 8 masses, a chain at rest set
going, and the swaying chain bounded. In the browser, the modes come in
order in the group and the address, and time backwards is faded and refused
under each force.

## 78. The piece keeps the music's beat

*2026-11-21.* A beat clock hears the music and tells the piece, every frame,
its tempo in beats a minute, where it is in the beat and in a bar of four,
and how sure it is of them. Once the clock is sure, the tempo shows beside
the words of the music's panel.

- **How it hears.** Every 10 ms it measures how much the spectrum rose, over
  a window of about 21 ms in third-octave pieces from 30 Hz to 16 kHz: the
  attacks' envelope. The tempo is the delay at which that envelope best
  matches itself, kept as a running sum over about 3 s, among tempi from 50
  to 220 a minute, leaning to 120 with a width of half an octave; another
  tempo is taken once it has held for 1.5 s. A comb whose teeth are a beat
  apart, laid over the last six beats, finds where the beats fall. A hand
  goes round at the tempo: it starts at the comb's beat when a tempo is
  found, and is drawn a little towards it every 10 ms, which also trims the
  tempo. The bar's first beat is the one that has brought the most bass over
  the last bars. The clock's sureness follows how steadily the comb has
  agreed with the hand over the last 2 s.
- **Where it runs.** For the microphone, a tab and a file, on the browser's
  audio line (an AudioWorklet), which hands it every sample at an even pace
  whatever the frames do. The demo beat's clock runs on the page, fed the
  beat's samples from its function. The rest of the hearing stays on the
  page a frame at a time (decision 44). Each frame takes what the clock said
  last and moves it on to the moment heard: for a file and the demo beat,
  the sample leaving the speaker; for the microphone and a tab, the latest
  that came in.
- **On the panel.** The tempo, as "120 bpm.", from a sureness of 0.8 until
  it falls under 0.6 or the music goes silent. The row centres a group's
  panel over its icon again whenever the panel grows or shrinks, as it does
  with the tempo.

**Why.** The clock needs the samples at an even pace, which frames do not
give (from 10 to 60 a second here). The rest of the hearing, at 0.35 to 0.9
ms a time, would cost the line that plays the sound 35 to 90 ms a second at
a hundred times a second; the clock alone costs about 5 ms a second of
sound. Decision 47 left the tempo of realtime-bpm-analyzer to be weighed
again with the clock: on clicks whose tempo changes it took 15.8 and 14.3 s
to follow the changes, against 4.8 and 3.7 s, and it gives no beat.

**Evidence.** Measured off the repository on the demo beat, on click trains
whose tempo changes, and on the four excerpts of decision 47, against the
beats librosa finds in them, from 5 s after the start or a change:

| Music | Tempo within 2% | Found in | Beats within 70 ms | Typical error of the beat |
|---|---|---|---|---|
| Demo beat, 120 | 100% | 2.4 s | 100% | 6 ms |
| Clicks, 120, 100, 140 | 100% | 2.4 s; 4.8 and 3.7 s after each change | 100% | 3 ms |
| Clicks, 90, 160, 75 | 99% | 2.4 s; 3.3 and 5.6 s | 100% | 3 ms |
| Electronic excerpt, 113.6 | 100% | 2.4 s | 100% | 10 ms |
| 5/4, metal and piano excerpts | 15 to 33% | | 26 to 33% | 85 to 162 ms |

On those three, where librosa's own beats are unsure, the clock's tempo
wanders; its sureness stays under 0.5 on the 5/4 and the metal, and near
0.9 on the piano. On the demo beat, the bar's first beat falls within 60 ms
of the bar's at 96% of the bars after 8 s. Unit tests: a click train's tempo
within 1% from 3 s and its beats within 25 ms; tempi of 90, 160 and 75
followed within 8 s of each change; the demo beat's tempo within 0.5%, its
beats within 25 ms and its bars' first beats; the same records whatever
size the blocks of samples come in; no sureness in a room's hiss, and none
six beats after the music stops; a record moved on in time; the panel's
words. In the browser, the demo beat's panel says "120 bpm.", and a file of
clicks at 100 a minute, heard on the audio line, "100 bpm.".

## 79. The music tunes the chain to its bars

*2026-11-21.* One more candidate of the music's group adds a force to the
light of "light", after "sway": **tuned**. While the beat clock (decision
78) is sure of the beat, it sets gravity's strength for the chain's slowest
mode to swing once a bar of four, and pushes the pivot across gravity on the
beats, two beats to one side and two to the other. As decision 75's forces,
it acts only while a source plays and the piece runs, and time backwards
does nothing meanwhile.

- **Gravity.** The slowest mode of an equal chain swings at a squared
  frequency of λ₁ g / l, l a rod's length and λ₁ the first zero of the
  Laguerre polynomial of the chain's degree (PH-7). Gravity's strength is
  set for that swing to last a bar at the piece's speed: 13.2 m/s² for two
  masses at 120 beats a minute and ×0.8, 11.3 for eight. It eases there over
  about a second, along the visitor's gravity, whose direction it keeps;
  where the clock is unsure or the music silent, it eases back to the
  visitor's. Where once a bar would ask for more than Jupiter's, the chain
  swings once every two bars, or four.
- **The pushes.** At each beat's moment within the frame, 3 mm at the middle
  strength, each coming back over about half a second, so that the next
  beat's comes before it is back. None with reduced motion asked for.
- **Drag.** 0.1 a second while the music plays, 2 in its silence.

**Why.** The probe of the music's physics found a mode tuned to the tempo
growing over 22 to 38 beats, as long as the tempo is within 2%; the beat
clock gives it within 0.5%. Swinging once a bar, the whole chain moves: the
tip of two masses by 9.7% of the chain's length by 40 s, where the probe's
mode 2, once every two beats and pushed alike, moves the middle mass by 4.7%
and the tip by 1.6%. Measured on the piece's own step, which takes each
push's pull at every stage, a push gives half of what the probe found by
holding it over a substep; one that comes back over half a second gives
about twice what one as short as a kick's gives.

**Evidence.** The piece's step at 120 beats a minute and ×0.8, from near
rest, the tip's reach as a share of the chain's length by 10, 20 and 40 s:
two masses 3.9, 6.6 and 9.7% (with pushes as short as a kick's, 1.8, 3.0 and
4.3%; twice as far and as short, 3.5, 5.9 and 8.6%); three masses 4.2, 7.1
and 10.4%; eight 4.6, 8.0 and 11.6%, other modes moving too. A twin costs
1.7 times as much under it on two masses, 1.3 on eight and 2.3 on sixteen,
with fourteen pushes alive in a frame. Unit tests: gravity's strength for
two and eight masses, at 90 and 120 beats a minute, along a turned gravity;
once every two bars past Jupiter's; each push at its beat's moment in a
frame, run a frame ahead or ending at the moment heard, two to a side, as
far as the strength asks; nothing pushed and gravity given back where the
clock is unsure or absent, the drag in play and in silence, nothing pushed
with reduced motion; two and three masses swinging once a bar, crossing the
middle twice a bar over the last 10 s of 30, at more than half their reach
by 20 s (PH-7). In the browser, the mode comes after "sway" in the group and
the address.

## 80. The chain's motion is a module of its own

*2026-11-21.* The chain's motion over a frame leaves the page's code for a
module of its own, `chain-in-hand/motion.ts`: where the chain is and how it
moves, the visitor's hand, the shaken pivot, the music's forces and the pivot
where they take it. Each frame the page asks it for the time that went by;
the motion steps that time in the frame's pieces (decision 21) and gives back
a record of the frame, as data: how long each piece ran; where every mass and
the pivot were at its end, and each mass's velocity there for trails kept as
curves; and the frame's time, the clock's span, the piece's, and where it
starts against the moment the music was heard. The page draws the trails
from the record, after the step, and sends the twins their share of the
shake and the music's command from the motion. Nothing on screen changes.

**Why.** One function of the page held the motion with the drawing, the
controls and the gestures, 2 413 lines, and only the browser tests reached
the motion. As a module, the motion is tested on its own, and the music's
forces change with it alone; its record is plain data, which the tests read
directly.

**Evidence.** Unit tests: a frame in pieces, 480 to the simulated second,
from 4 to 16, each stepped as the stepper steps it, bit for bit, on 1 to 64
masses; the record's positions hung from the pivot where the music's kicks
take it, its velocities with the pivot's; slow motion where the clock passes
the deadline; the hand in the pivot's frame; the music's forces heard from
the frame's start when it runs ahead, and ending at the moment heard when it
runs now (decision 51); the shake's phase going on with the time simulated;
the tension summed over the pieces; starting again, other masses, time
backwards. In the browser, the same script on the page's own clock against
the code before, in twenty cases (the opening; 8 masses; slow motion; the
hand; the shake; other masses; time backwards; the tension's colours; the
strobe, alone and on the music's kicks; layers; the ribbon; twins, free and
held; the five forces with the demo beat; the speaker with twins): the saved
moment's code and the screen the same, byte for byte. Drawing the trails
from the record takes under 0.1 ms a frame with the tip alone, 0.5 ms with
every mass drawing on 64 masses and 0.8 ms on 512, and no longer runs inside
the 6 ms the physics has (decision 15); with 512 masses, where the physics
is cut in the frame's first piece, the time it reached stayed the same
within the runs' spread (21.4% of the time asked before, 20.3% after).

## 81. The chain's motion changes by events, and is taken whole

*2026-11-21.* Between frames, the chain's motion (decision 80) changes by
events alone: the chain starts from a state given, other masses, the
visitor's hand grabs, takes another grip and lets go, time runs the other
way, gravity, the shake, the tension measured afresh. A setting goes to a
value, never by a step, so that the same event twice leaves the motion as
once. A diary notes each event with the frames run, the piece's time and the
clock's, the latest 1 024. The motion's whole state is taken as a snapshot of
plain data, copied: the chain's angles and rates, the shake's phase, gravity,
the shake asked for, the hand with its grip, the pivot, the chain the screen
shows, the times and the frames run; given back to a motion, the music's
forces there start afresh. A moment saved is taken from a snapshot, and a
frame run ahead keeps the chain the screen shows itself (decision 51).
Nothing on screen changes.

**Why.** Nine functions of the page, among the controls, the gestures and
the frame, changed the chain's motion, each in its own way. Now what changes
it is a closed list, in order, each change written down, and a session run
again from a snapshot with its diary and its frames ends alike, bit for bit.

**Evidence.** Unit tests: each event; a setting twice as once; the diary's
notes and its length; a snapshot given to a motion of another number of
masses, going on as the one it was taken from for 120 frames, bit for bit;
the music's forces afresh after a snapshot. A replay test runs a script of
20 s, 13 events (other masses twice, the hand grabbing twice and once taking
another grip, gravity, the shake on and off, the tension afresh, time
backwards twice), frames run now and ahead in turns, the demo beat heard
through the page's own hearing and beat clock under the five forces, and
runs it again from the snapshot taken as it began with the events its diary
noted: the same end, bit for bit. The end is kept in the test, so that a
change to the physics that was not meant fails it. In the browser, decision
80's twenty cases against the code before: the saved moment's code and the
screen the same, byte for byte.

## 82. Each of the music's forces is a class of its own

*2026-11-21.* The music's five forces (decisions 75, 77 and 79) leave the
one class that held them all for a class each, in `chain-in-hand/forces/`:
the speaker, the dancing hand, the breath, the swaying gravity and the tuned
chain, with the swing from side to side that the hand and gravity both
follow as a class of its own. Each frame, `MusicForces` begins the force of
the mode playing afresh when the mode changes, and puts it together with
what outlasts it: the pivot's kicks, the piece's time they run on, and the
drag, which eases from one force's to the next. Nothing on screen changes.

**Why.** The five shared one class and its fields: the hand and the breath
one grip, the hand and gravity one swing, gravity and the tuned chain one
lean. A change to one force went through the state of all five; now it stays
in that force's file.

**Evidence.** The forces' unit tests and the motion's pass unchanged, save
where the tests import from; the replay test of decision 81, which runs the
five forces with the demo beat, ends where it ended, bit for bit. In the
browser, decision 80's twenty cases against the code before: the saved
moment's code and the screen the same, byte for byte.

## 83. The dancing hand follows a choreography

*2026-11-21.* The dancing hand of decision 75 follows a choreography of
layers, each chosen on its own and carried by the address in its readable
part:

- **the figure** the hand traces: the swing from side to side, a circle, a
  turn round the pivot, an eight lying or upright, a conductor's beat in a
  bar of four, a bounce towards the pivot and back, or four poses
  (`figure=`);
- **the place** it traces it: the chain hanging, held level to a side, or
  standing (`place=`);
- **what leads it** from one point of the figure to the next: the beat
  clock, which brings it to each point on its beat, or a sound heard, on
  which it sets off: the kick, the snare, the hi-hat, any attack, a drum's
  hit, a note, a change of the bass's note (`lead=`);
- **how many beats**, or sounds, from one point to the next: a half, 1, 2,
  4 or 8; or, led by the clock, the number for which a turn lasts about as
  long as the chain's slowest swing (`beats=`);
- **the feel** of its moves: a snap, then still; smooth; or a conductor's
  beat, quick through the points and slow between (`feel=`).

The figure swings as far as the loudness, as before. The hand is hidden, so
that the chain dances by itself, unless the address shows it
(`showhand=1`). The dance opens as it did: the swing, hanging, a side on each
kick, in a snap.

**Why.** The hand swung the same way to every music, on the kicks the
analysis hears, which include the bass's notes. As layers that each change
one thing, the dance becomes a way to compose with the music; led by the
clock, the hand reaches the beat instead of following it.

**Evidence.** Unit tests for the address and for each layer. Opened as
before, decision 75's tests pass unchanged and the replay test of decision
81 ends where it ended, bit for bit. In the browser, the choreography stays
in the address beside the music's mode and a saved moment. Measured before
the change, with the demo beat at ×0.8: 10 of the 21 sounds heard as kicks
in 10 s were the bass's notes; led by the clock, smooth, a swing a bar, the
tip followed its target at 0.93 (one less the root mean square of the tip's
angle from the target's, over the target's), against 0.56 for the swing on
the kicks.

## 84. The site counts its visits, without cookies

*2026-11-21.* The published site counts its visits with Cloudflare Web
Analytics, which keeps no cookie: how many came, from where, on which
device and browser, and how soon the page answered a touch. Only the
published site counts, in a browser that no program drives, so the browser
tests and the README's pictures are not counted. A device stops being
counted with `?count=0` in the address and counts again with `?count=1`:
the switch leaves the address as the page opens, so that a shared address
never carries it, and it is the only thing the site keeps on a device. The
QR code's card says under its title, faintly, that visits are counted, or
that the device is not. The address's changes are not counted as pages.

**Why.** GitHub Pages keeps no log of a site's visits and shows traffic only
for the repository, so what the site learns of its visits the page has to
send. Cloudflare's script needs no cookie, no server and no change to the
DNS, costs nothing, and reports the delay between a touch and the screen's
answer by browser and country. Weighed: Umami Cloud, GoatCounter and
Plausible, which keep no cookie either; Google Analytics and Microsoft
Clarity, which do.

**Evidence.** Unit tests for the switch and for which visits count. In the
browser, the switch leaves the address and is kept, the card says so, and
away from the published site the page asks nothing of Cloudflare. The script
can count each change of the address as a page, through the Navigation
API's `navigate` event; in Chromium 158, `history.replaceState`, which the
piece calls for every setting it writes to its address, fires that event,
so the script runs with that counting off. At the published host, routed
to the build in a browser that says no program drives it, the page added
the script as Cloudflare's snippet has it, a module with the site's token
and `"spa": false`; after `?count=0` it added none, on that visit and the
next.

## 85. The dancing hand's expression and body

*2026-11-21.* The choreography of decision 83 gains the dance's expression,
what the music changes as the hand goes, and the hand's body, how it holds
the chain. Each layer is chosen on its own and carried by the address:

- **the size** the figure swings to follows the loudness, as before; or
  stays fixed, as for music as loud as it has been; or follows the bass, the
  treble, or the kicks, swelling as far as each is strong and shrinking
  until the next (`size=`);
- **the middle** of the figure stays; or turns to the bass's note, to the
  right for a note above those the bass played lately and to the left for
  one below, 20° for an octave at the middle strength; or rises towards the
  side as the music is loud, up to a quarter of a turn and never past
  standing, and hangs again in silence (`center=`);
- **the grip** holds as firmly throughout; or pulses on the beat, firm on
  each and loose halfway between, while the beat clock is sure
  (`pulse=beat`);
- **the mass** the hand holds: the tip, the one halfway down, or the one a
  quarter of the way down, near the pivot (`grab=`);
- **how firmly**, in five steps from gentle to forced: 4, 7, 12, 40 and 120
  rad/s, damped as the visitor's hand is at its steps and critically at 120
  (`grip=`);
- **the slack**: the hand keeps its target as far from the pivot as the
  held mass hangs, or nearer by a tenth of that a step, up to four tenths
  (`slack=`).

The dance opens as it did: as wide as the music is loud, from the middle,
by the tip, with the grip of 12, taut. Where reduced motion is asked for,
the grip does not pulse.

**Why.** One grip did not suit every music: at 12, the hand moved nothing in
slow motion and whipped the chain at the music's strongest step, and holding
the tip closed the twins' fan over time. As layers of their own, the grip,
the mass held and what the music changes as the hand goes are composed with
the rest.

**Evidence.** Unit tests for the address and for each layer. Opened as
before, the tests of decisions 75 and 83 pass unchanged and the replay test
of decision 81 ends where it ended, bit for bit. In the browser, the new
layers stay in the address beside the music's mode and a saved moment.
Measured before the change, with the demo beat, by how closely the tip
followed its target (decision 83): at ×0.8 and the music's strongest step, a
grip of 4 followed at −0.44 to 0.41, 12 at 0.23 to 0.66, 40 at 0.88 to 0.91
and 120 at 0.99; at ×0.1, 4 and 12 did not move the chain, and 120 followed
at 0.66 to 0.72 with 150 to 450 times the energy that lifts it level. A grip
of 120 costs up to six times the physics of the chain and of each twin.
Eight masses held by the middle kept their twins 0.1 to 0.6 m apart, where
held by the tip with the grip of 12 they came within 3 to 12 cm.

## 86. The kick is told from the bass by its fall

*2026-11-21.* An attack under 150 Hz is a kick only where its pitch falls,
as a drum's skin falls as it settles: where the band's centroid falls at
least 4 semitones, from the highest of the windows ending in the 33 ms up to
the frame that heard the attack to the lowest of those ending in the 50 ms
after it. A bass note holds its pitch, and its attack is no kick. So a kick
comes 50 ms later than before, to everything that follows the kicks: the
light's halo and strobe, the speaker, the sway, and the dance led by the
kicks or swelling with them. The windows are set in time, within the samples
a frame is given, so the verdict is the same however often frames come;
where they come more often than 60 a second, an attack is heard sooner, and
its windows are set from a 60th of a second after the frame before. The
onset, an attack in any band, still comes with the attack, the bass's
included.

**Why.** Under 150 Hz the analysis heard a kick wherever the bass began a
note: in the demo beat, 47 of the 110 kicks heard in a minute were the
bass's, and in a piano piece with no drums it heard 1.1 kicks a second; the
dance, the speaker and the sway moved on them. Weighed: telling a bass note
by the bass's pitch a frame after the attack, which waits less but removed
under half of the false kicks in music, and lost a fifth of an electronic
piece's kicks at 30 frames a second.

**Evidence.** Unit tests: a thump whose pitch falls is a kick 50 ms after
the frame that heard its attack, and at 12, 30 and 144 frames a second as at
60; a bass line's notes are none; in the demo beat, whose kicks each begin
with a bass note, the kicks are heard and none of the bass's notes alone.
The replay test of decision 81 ends elsewhere, as its forces now move on the
kicks alone: it hears the 21 kicks the demo beat strikes after the first.
Measured against the drums and the bass of four pieces of music, separated
by Demucs, and against the demo beat's own parts: at 60 frames a second,
the kicks heard went from 57 to 100% kicks in the demo beat and from 65 to
95% in an electronic piece, keeping all their kicks; a 5/4 beat and a metal
piece kept 89 and 97% of theirs; in the piano piece, two thirds of the false
kicks went. At 30 frames a second, as clean. At 120 and 144, 91 to 100% of
the kicks were kept, and a twentieth to a third of the false kicks
remained. A bass that leaps down a fourth or more can fall as far as a kick,
and be heard as one.

## 87. The dancing hand lets go, and its figure changes, over the bars

*2026-11-21.* The choreography of decisions 83 and 85 gains the dance's long
time. Over the bars the beat clock counts, whatever leads the hand, and while
the clock is sure:

- **the hand lets go** of the chain every 1, 2 or 4 bars, on the bar's first
  beat, and the chain flies with no hand and no drag; on the bar's third beat
  the hand catches the mass where it is, closing over a tenth of a second,
  and brings it back to its figure over a beat (`toss=`);
- **the figure changes** on the bar's first beat: every 1, 2, 4 or 8 bars to
  the next figure; or to the one the last bar's loudness picks, the first for
  a quiet bar and the last for a loud one, a bar near the line between them
  keeping the one it has; the new figure glides in from the old over a beat
  (`vary=`). The figures it changes through are those the address lists,
  joined by hyphens (`figure=swing-circle-eight`), or, where it names one,
  all eight in their order from it.

A hand that has let go catches the mass at once where the clock is no longer
sure, or the music falls silent. The dance counts its bars by the beats, one
a turn of the clock's beat, from the bar's first beat as the clock gives it
once sure, and moves that first beat only where the clock has held another
for two bars, gliding there over a beat. The dance opens as it did.

**Why.** A dance held one figure throughout. Letting go and catching gives a
bar a free flight and a catch, and figures that follow one another compose
over the bars. Which beat begins a bar is the clock's guess, the beat that
brought the most bass over the last bars, and it wavers: in the demo beat,
whose first and third beats both carry a kick and a bass note, it named every
second beat the first between 5.6 and 8 s, and in an electronic piece it
moved ten times in 41 s while sure. Counted by that guess, the dance missed
those bars, and a figure led by the clock went back to its start every
second.

**Evidence.** Unit tests for the address and for each layer, and for a clock
whose bar wavers, moves, or draws its beat back over a bar's first beat.
Opened as before, the tests of the dance's motion from decisions 75, 83 and
85 pass unchanged, and the replay test of decision 81 ends where it ended,
bit for bit. In the browser, the new layers stay in the address beside the
music's mode and a saved moment. On the page's path, with the demo beat, the
hand first let go at 7.0 s, against 10.0 s counted by the clock's bar, and a
circle led by the clock went round without going back to its start; with the
electronic piece, it let go on 17 bars in 39 s. Varying between two figures
with the loudness, the demo beat's figure changed as its quiet bars came and
went, a bar after them, twice every 16 s, and the electronic piece's once,
as it began.

## 88. The row's controls and keys change the piece by events

*2026-11-22.* The first piece's row of controls and its keys (decisions 31,
53 and 54), with the address and the page's title (decision 38), leave the
page's module for two of their own. `chain-in-hand/settings.ts` holds what
the address carries in its readable part (the controls' values, the three
switches, the music's mode and strength, the dance's choreography) and the
moment saved in it, and the piece's events: a closed list, each with the
value it asks for, a control to a value, a switch on or off, the music to a
mode and a strength, a source to listen to, or an action. A control stepped
makes its events in order, with the switches its value turns on after it (a
control of the light lights it, decision 27; a scale turns the tension's
colours on, decision 41); the settings take them, and the address and the
title are written from them. `chain-in-hand/row.ts` lays out the row with
the music's card and the QR code's (decisions 40 and 76), and takes the
buttons and the keys, but Space, which the gestures share. The page answers
each event with what it does to the chain, its twins, its trails and its
colours. Nothing on screen changes.

**Why.** A control's value, what it does to the piece, how the row shows it
and the address went through one function of the page, with a branch for
each control, and the keys through another. Now an event says what it asks,
the settings take it and the page answers it, and the row's settings and
address are tested without a browser.

**Evidence.** Unit tests: the events of a step, the switches after them;
the tension's one control and the scale kept apart; the music's mode and
strength; the zoom's − and +; the start stepped with a moment saved; the
moments forgotten and kept; the address written back as it opened, a saved
moment's code included, and the title. The browser tests pass unchanged. In
the browser, decision 80's twenty cases against the code before, and five
more through the row (a palette and a ground; the light put out, then lit
again by a control of the twins; a scale; the start stepped with a moment
saved; the mark left): the saved moment's code and the screen the same, byte
for byte.

## 89. The dance has a row of its own, in the music's group

*2026-11-22.* The music's group of the row gets a button for the dance, a
dancer, which opens the dance's own row stacked above the music's: a group
within a group, one level deeper than decision 54's. The row holds a control
for each layer of the dance's choreography (decisions 83, 85 and 87), in
their order and apart in sets: the figure and where it is traced; what leads
it, the beats from point to point and the feel; what the size and the middle
follow, and whether the grip pulses; the mass held, the grip, the slack, and
the hand, shown or hidden; when the hand lets go and catches, and when the
figure changes. Each steps through the values its layer takes in the
address, shown in words, and has no keys. A value chosen there puts the
music's mode on the dance, as a control of the light lights it (decision 27),
and the dance's button is lit while the music dances. A group's row too wide
for the screen scrolls sideways, faded at a side with more, as the row does.
Escape shuts the dance's row first, then the music's, and the music's group
opens again as it was left. The dance opens as before.

**Why.** The choreography could be composed only by writing the address; now
each layer is changed from the row and seen as it changes, while the bottom
row keeps its eight icons, which a 390 px screen fits.

**Evidence.** Unit tests: each control takes every value of its layer and
gives it back, opening at the dance as it opens; a figure stepped keeps the
rest of a list; a control stepped makes the dance's event, and the event
that puts the music on the dance where it does something else; the address
carries both. Browser tests: the dance's row opens above the music's, in the
layers' order, within a 390 px screen and scrolling; Escape shuts it, then
the music's, which opens again with it; a value chosen goes into the address
with the music on the dance, and lights the button; the hand's switch shows
the hand; the address opened again shows the dance as it was left. The
icons were chosen from a sheet of candidates at the row's size, and looked
at built, at 390 px and on a desktop.

## 90. The piece's drawing is a module of its own, and its trails are drawn in layers

*2026-11-22.* What the first piece's frame shows and the trails its motion
leaves move from the page's module to one of their own,
`chain-in-hand/drawing.ts`: the chain, its twins, the hand and the pivot, in
the light of the trails, the twins and the sketch (decisions 24 and 61); each
frame's motion drawn into the trails, kept as curves or as the image carried
(decisions 66, 68 and 71); a strobe's stamps (decision 50); and the
tension's colours (decision 35). The trails are drawn in layers, each saying
what leaves it (the chain or its twins), how (lines along the paths, or a
strobe's stamps) and which parts (the tip, every mass, the rods). The
trails' controls say which layers there are, and every layer draws into the
one image of the trails. The page tells the drawing what each frame needs,
and draws the twins' trails through it. Nothing on screen changes.

**Why.** The drawing was the largest part of the page's module, between the
controls, the gestures and the twins, and a change to how something is
drawn went through all of it. Now it stays in one file, and what leaves the
trails is said in one place, the layers, which the drawing follows.

**Evidence.** Unit tests: the layers the controls ask for (the tips, every
mass with the ribbon, twins as dust, a strobe), found by what leaves them
and how, and the same layers each time the same controls ask. The unit and
browser tests pass unchanged. In the browser, the twenty-five cases of
decisions 80 and 88 against the code before, and eleven more through the
drawing (the sketch's light; twins as dust; a strobe with twins, with the
ribbon and with the tension's colours; the view nearer and farther, kept as
curves and as layers; the chain hidden under the music's glow; a mark with
twins; the trails off; the dancing hand shown): the saved moment's code and
the screen the same, byte for byte.

## 91. A strobe's trails are kept as curves

*2026-11-22.* A strobe's stamps (decision 50) are kept as curves, as the
trails' lines are (decisions 68 and 71): each rod a flash stamps is a
straight span, as bright at both ends, both at the fade's clock at the
flash's instant, drawn into the trails at once and drawn anew, as fine, in
any view. The trails no longer go over to the image carried while a strobe
draws them, which cleared them once the view came more than a quarter
nearer, and cut them to what the nearer view had seen once it went back; the
meter names the curves. A mark, and browsers without half floats, still go
on as the image carried. This replaces what decisions 68 and 71 said of a
strobe's trails.

**Why.** A strobe's trails were cleared by the zoom.

**Evidence.** Unit tests: a straight span runs along its chord and bends
nowhere, as bright at both ends, at one instant of the fade; the curves are
kept with a strobe, and the image carried with a mark and in eight bits. A
browser test: the strobe turned on and off keeps the meter on the curves. In
the browser, side by side with the code before, on the page's own clock: the
thirty-one cases without a strobe the same, byte for byte, and the motion the
same in all; with a strobe, in the whole view, the same picture to the eye,
0.7 to 4.8% of the pixels differing, by 0.02 to 0.1 of 255 on average, the
most where stamped rods meet; three times a quarter nearer, every copy kept
and as fine, where the code before kept those of the flashes after the zoom
alone; back in the whole view, every copy, where the code before kept those
since the zoom alone, cut to what the nearer view had seen. Without a
graphics card, at 1280 by 720, medians of twenty readings in two orders: 40
frames a second with a strobe kept as curves against 31 as the image
carried, and 16 against 14 with the twins this machine carries of 512.

## 92. The piece's twins are a module of their own

*2026-11-22.* The first piece's twins move from the page's module to one of
their own, `chain-in-hand/twins.ts`: their workers and the time each may
take (decisions 51 and 52); their colours by their place in the fan
(decision 23); their birth when the chain is let go, again as they fade
(decision 43) and on the music's beats (decision 46), and their light; the
lens and the leash (decision 64); and, in one place, what is sent to the
workers each frame and what comes back: the time to advance in pieces for
the trails, and the tips along it, drawn into the trails (decisions 21 and
68) where the pivot was at each instant (decision 75), and stamped by a
strobe (decision 50). The page asks the twins to be born, sent and taken,
and draws them through the drawing (decision 90). Nothing on screen changes.

**Why.** The twins were the largest part left in the page's module, spread
between the frame, the controls and the gestures; a change to what goes to
their workers, or to how their tips are drawn, went through all of it. Now
it stays in one file.

**Evidence.** Unit tests: the pieces a frame is sent in, the light of the
twins' trails, the pivot at each of a report's instants, and a twin's tip
drawn as a curve, going on from one report to the next and starting anew
where it jumped. The unit and browser tests pass unchanged. In the browser,
the thirty-six cases of decision 90 against the code before, and eight more
of the twins (staying, leashed, born round the pivot, run backwards, let go
by the hand, born again on the music's hits and kicks, and spread by its
fan): the saved moment's code and the screen the same, byte for byte.

## 94. A recorder the address can ask for measures where a frame's time goes

*2026-11-22.* With `?perf=1` in the address, the page records, after twenty
seconds of warm-up, twenty seconds of frames: the time each stage of a frame
takes on the main line (the music, the chain, the twins taken, the drawing
in four parts, the twins born, the controls shown, the twins sent), every
report the twins' workers send back (decision 51), the frames' rhythm and
the workers' budget (decision 52), and, where the browser can tell it, the
time the graphics card takes to draw. It then saves the record as a file on
the device, and a line in the top right corner becomes a link to save it
again; nothing is sent anywhere. `perfwarm=` and `perfspan=` change the
seconds, and `perflabel=` names the file. The recorder's keys leave the
address as the page opens, as the visits' switch does (decision 84), so that
no link shared or saved carries them. Without them nothing is recorded, and
nothing on screen changes.

**Why.** What holds the frames back differs by device and by setting: the
main line, the twins' workers or the graphics card. A change made to speed
them up is chosen by which one, and checked on the devices themselves.

**Evidence.** Unit tests: what the address asks for and the seconds it may
ask, the address without the recorder's keys and the rest as it was written,
a row per frame with the workers' reports and the graphics card's time once
it answers, and the file's name. A browser test: the file is saved, every
column a row per frame, and the address no longer carries the keys; without
them, no recorder. In the browser, side by side with the code before, on the
page's own clock, the forty-four cases of decisions 90 and 92: the saved
moment's code and the screen the same, byte for byte.

## 95. A share of the twins can join its twins' trails into curves where it runs

*2026-11-22.* A share of the twins (decision 51) can join its own twins'
trails into curves (decision 68) where it runs, in a worker or on the main
line, with the numbers the page joins them with: each tip where the pivot
was at each instant, under the command's own music (decision 75), in its
place's colour tinted as the music asks (decisions 23 and 46), in the
trails' light times its own while the twins fade (decision 43) times the
music's. It sends back the intervals to draw now, the spans they closed,
those a split closed before its time, and those still open, as bytes handed
over, not copied. A split or a forget of those curves goes to every share as
an event, the commands are numbered, and the page can tell when every share
has had each command it was sent taken back. A twin's curve and the pivot
over a report are pure functions in `core/`. The page asks for no curves
yet, and joins them itself, as before. The merger and the twins' jump take a
square root where `Math.hypot` was. Nothing on screen changes.

**Why.** With few masses and thousands of twins, joining the twins' trails
into curves took most of a frame on the main line; where the twins move, it
can go beside their motion. The square root gives the same curves sooner:
28 to 38% less time in the merger, the curves the same byte for byte, in a
bench of 627 000 curves.

**Evidence.** Unit tests: a share joins the same spans as the page, byte for
byte, alone and as one of three shares, over forty frames with the music's
kicks and tint, a twin born again, twins dropped, a split and a forget; a
command that asks for none gets none; the lens measures the fan's stretch
across a split and a forget as if neither had come (decision 64); the
commands are numbered, and every share is in step once each report is taken;
a batch hands its spans over as bytes and takes another's after its own. In
the browser, side by side with the code before, on the page's own clock, the
forty-four cases of decisions 90 and 92: the saved moment's code and the
screen the same, byte for byte.

## 96. The trails are drawn in four layers, each a control of its own

*2026-11-22.* The trails' style and the ribbon (decisions 26, 50 and 53)
give way to four controls in the trails' group, after how long they last:
the lines from the chain, the strobe on the chain, the lines from the twins
and the strobe on the twins. The chain's two step through none of it, its
tip, every mass, its rods and the whole chain; the twins' two, through none
and each twin's tip. Lines from the rods are a veil: each rod stamped at
every piece of the step, each end as bright as it moved over the piece, and
fainter the more rods there are, so that where the chain goes slowly the
stamps run together into an even surface, and where it goes fast they part
into a fan of streaks. A strobe stamps the rods as before, and the tip or
every mass as points; the whole chain is both. Lines and stamps of one
target are drawn together, and the twins as dust leave the trails these
controls say. The points a strobe stamps light in both mechanisms, drawn
round: as the image carried, and kept as curves, as spans of no length
marked as points. The twins' tips never lit before, as pieces of no length
with cut ends. The piece opens as before, with lines from the tips of the
chain and of each twin. The address carries the four, and the saved moment's
code is of version 11; addresses and codes written before open as they
showed: the style's strobe stamps the chain's rods with no lines, the ribbon
draws lines from every mass, and the twins as dust draw none. This replaces
what decisions 26, 50 and 53 said of the trails' style, the ribbon and the
trails of the twins as dust.

**Why.** What left the trails, and how, was one choice for all of them: a
strobe stamped the chain and no lines were drawn, the twins' points never
lit, and only the chain's masses could draw lines. Each layer is now chosen
apart, so that lines and stamps, of the chain and of the twins, can be put
together.

**Evidence.** Unit tests: the four controls, their values and keys; the
layers each asks for, from each part, together in the row's order; the
veil's light, none across a jump; a point, and a straight span brighter at
one end, kept as curves; the code of version 11, and the codes and readable
addresses written before opening as they showed; the title. Browser tests:
the keys step the chain's lines and strobe through their parts, the address
following; a strobe stamping the twins' tips lights the trails, more than
twice as much light as without, kept as curves and as the image carried; a
mark with every layer. In the browser, side by side with the code before, on
the page's own clock: the thirty-six cases of decisions 90 and 92, and five
more of addresses written with the style, the ribbon and the twins as dust,
with twins, the same screen, byte for byte.

## 97. The twins' trails are joined into curves where the twins move

*2026-11-22.* Where the trails are kept as curves (decision 68) and the
twins draw lines, each share of the twins (decision 51) joins its own twins'
trails into curves (decision 95) and sends them back, and the page adds them
after the chain's as they come; it no longer joins the twins' itself. A
command carries the light, the palette and the tint of the frame that sends
it, so that with the music the twins' trails take its light and its note's
colour (decision 46), and a new palette its colours, one frame later than
before. The trails ask the shares to split their open curves for a snapshot
and as the coarse image is born (decision 68), and to let them go when the
trails are put out, and an ask reaches a share with its next command. A
snapshot is therefore taken only in a frame in which every share has had
each of its reports taken, and its mark is placed once every share's split
is back, the spans closed meanwhile after it and drawn as well when the view
is drawn anew; a composed snapshot (decision 70) waits whole. A report
joined before the coarse image was born gives it the intervals it lacks, and
one joined before the trails were put out is not drawn. A report draws the
frame of trail of all its twins, those its budget or a key drops included;
the drop holds from the next command. Where the workers fail, the curves
they had open stay in the window. The recorder (decision 94) counts the
frames a snapshot waited.

**Why.** With few masses and thousands of twins, joining the twins' trails
took most of the main line's frame, and the twins the budget could carry
rose and fell with it.

**Evidence.** Unit tests: where each batch a report brings back goes, by the
number of the command it answers (before and after the trails were put out,
the coarse image born, a snapshot's split awaited); the workers' next
number, every report handed back, each share's own numbers; a split sent
back where no curves are joined. In the browser, side by side with the code
before, on the page's own clock, the twins on the main line: of the
forty-nine cases of decisions 90, 92 and 96, forty-three the same, byte for
byte; in the other six, a frame of the twins' trails: with the music, its
light a frame later (at most 3 of 255, on about 1% of the pixels); at a
change of palette, the old colour a frame longer; as the hand takes the
chain, the trail of the twins put out a frame longer. With the music
lighting and tinting 512 twins, 3 to 4% of the pixels differ, by up to 30 of
255. On a desktop with a graphics card, two masses and 4 096 twins, from the
recorder's files: the main line's time a frame from 6.0 to 1.7 ms on average
and from 10.3 to 4.0 ms at the 99th percentile, taking the twins from 4.7 to
0.4 ms, each worker's report 30% longer; the fan at 4 096 but for 0.8 s
after every worker stalled for two frames, as they had once without the
change. With eight masses, 3.3 to 1.8 ms, and the fan 7% wider on average.

## 99. The window of curves grows on the graphics card a piece at a time

*2026-11-22.* The window of trails kept as curves (decision 68) keeps its
spans on the graphics card in pieces of 2 MB, each made as its first page is
taken, where it kept one pool that doubled when full. Growing no longer
copies what the window holds nor sends it to the card again: a frame sends
its new spans alone. What is drawn does not change. The meter's memory
(decision 68) counts the pieces made.

**Why.** Each time the pool doubled, that frame copied it and sent it to the
card whole, each doubling twice as costly as the one before. On a desktop
with a graphics card, eleven of thirteen recordings of twenty seconds
(decision 94) held a frame of 16 to 40 ms in the trails, at an instant that
differed from case to case, and none at the third snapshot with two masses,
which a stall of the snapshots would have shown (a reading on the fade's
clock alone, corrected in decision 101). Timed part by part in a
browser drawing without a graphics card, the doublings cost 3, 6, 15 and
28 ms as the pool grew to 32 MB; a snapshot, 0.3 ms.

**Evidence.** Unit tests, on a card that keeps its buffers' bytes: each
batch sends the card its own spans and nothing more, every buffer made is
one piece's size, and each span is drawn from where it was put, square by
square in the order it came, across pieces. In the browser, side by side
with the code before, on the page's own clock: the opening for 900 frames,
past a snapshot, and 1 024 twins through a zoom, the window grown over many
pieces, and eighteen cases of decisions 90, 92 and 96, the screen the same,
byte for byte. The opening recorded from its start for 40 s without a
graphics card: the frames that grew the pool, 11.5 and 16.0 ms in the
trails, are gone; the slowest frame's trails take 2.9 ms.

## 100. A strobe stamps the twins as it stamps the chain, each where it is at the flash

*2026-11-22.* The strobe on the twins (decision 96) steps through the parts
the chain's does: each twin's tip, every mass, its rods, or the whole twin.
Each twin is stamped where it is at the instant the chain is stamped at. The
command a share of the twins is sent each frame (decision 51) carries the
frame's flashes, and the share finds each twin's angles at a flash between
the ends of the piece of its step the flash falls in, from the angles and
their rates at both ends, by Hermite's cubic, with no step of the motion
added. Where the trails are kept as curves, the share stamps its twins into a
batch of its own, which the page draws and keeps with the twins' curves
(decision 97); elsewhere it sends back where each twin's masses were, and the
page stamps them. A twin's rods are as bright as its lines, and its points
twice that, as the chain's are. The tips' points, which went where each tip
was at the end of the frame, and which a share's report a frame late lost or
took from another frame, are now where the chain's flash was. The saved
moment's code is of version 12, a byte longer; addresses and codes written
before open as they showed.

**Why.** The strobe stamped each twin's tip alone, at the end of the frame,
while it could stamp the chain whole.

**Evidence.** Unit tests: every mass of a twin at a flash within a fifth of
a millimetre of where the twins' own step puts it, with two and five masses,
under the music and a shake, and the tip, with two and eight, fifty times
nearer than the nearer end of its piece or more; the twins' motion the same,
number for number, with stamps and without; the share's batch of stamps the
same, byte for byte, as the page's from the places sent back; where the
trails take the stamps, before and after the coarse image is born and once
the trails are put out; the control, the code of version 12 and those before
it, the title. A browser test: the twins' rods light the trails four times
as much as their tips or more, kept as curves and as the image carried. In
the browser, side by side with the code before, on the page's own clock: the
forty-nine cases of decisions 90, 92, 96 and 97 the same, byte for byte;
with the twins' tips stamped, the points a little moved, to the chain's
flash. On a two-core machine without a graphics card, a flash that stamps
the twins whole adds a third of a millisecond to a share's frame of 585
twins of two masses, about a fifth, and half a millisecond to one of 270
twins of eight, about a tenth; as the piece opens, a frame in six has a
flash.

## 101. The card is asked once whether an image of a kind can be drawn into

*2026-11-22.* An image the trails draw light into (decision 68) is made on
the graphics card of half floats, or of eight bits where half floats cannot
be drawn into, and the card was asked whether it could be drawn into each
time one was made. It is now asked only until an image of that kind is
found drawable, as the page opens: the snapshots of the trails kept as
curves (decision 70), whose first three each make an image the canvas's
size, no longer ask. What is drawn does not change.

**Why.** The answer waits for the card to reach the question, behind all it
was given. On a desktop with a graphics card and 4 096 twins, each of the
first three snapshots held its frame 21 to 26 ms with sixteen masses, and
32 to 42 ms with two in a larger window, where each made the screen miss a
frame; asking was almost all of it. Decision 99 read the recordings before
it on the fade's clock alone, and found no stall at the third snapshot with
two masses: with two masses and thousands of twins, a snapshot falls due by
its spans first, and the stall was at the first three snapshots.

**Evidence.** Unit tests, on a card that counts the questions: the first
image of a kind asks, and the next ones of that kind, of any size, do not;
another page's card is asked again; where half floats cannot be drawn into,
the images fall back to eight bits as before. On the desktop, a page from
the disk timed each part of each snapshot, asking and not asking after the
first image: not asking, the first three snapshots took half a millisecond
or less, with two masses or sixteen, and the screen missed no frame near
any; the card worked 5 to 9 ms more in their frames, making the image,
within the frame's 16.7 ms. As the page opens, the second image no longer
asks, which had taken 9 to 17 ms. In the browser, side by side with the
code before, on the page's own clock: ten cases, the screen the same, byte
for byte.

## 102. Each layer of the trails has a light of its own, in a row of its own

*2026-11-23.* Each of the trails' four layers (decision 96), the chain's
lines and its strobe, the twins' lines and theirs, is drawn as bright as a
light of its own says: from a quarter of the light it is born with to four
times it, in nine steps of about 1.4, two of which double it, opening at the
light each had. A layer's light takes the whole layer: the tip's line, the
ribbon and the veil; the strobe's rods and its points, still twice as
bright; the twins' lines; their rods and points. The music's light comes on
top of it, dense light turns white as before (decision 61), and the light
switch puts it all out. In the trails' group of the row, each layer is now a
button that opens the layer's own row, stacked above, as the dance's does
(decision 89): the parts the layer comes from, the control of before, with
its keys, and the layer's light, without keys. A layer's button is lit while
the layer is drawn, and its light is faint while it is not. The four lights
share one icon, a sun, each in its layer's row beside the layer's own; every
other control keeps an icon of its own (decision 31). The address carries a
light where it is not the one the layer opens with, as `strobelight=2`, and
the title names it while its layer is drawn. A share of the twins is sent
their lines' light and their stamps' apart. The saved moment's code is of
version 13, two bytes longer; addresses and codes written before open as
they showed.

**Why.** Each layer was drawn in a light fixed in the code, and the light of
the parts decisions 96 and 100 added was a first guess.

**Evidence.** Unit tests: the four lights, their steps and their place after
each layer; each layer in its own light, the others as before; a share's
stamps in their light, each four times as bright at four times it, apart from
its lines'; the code of version 13 and the one before it; the readable
address; the title, only while the layer is drawn. Browser tests: each
layer's row opens above the trails', its button lit while the layer is drawn,
its light kept in the address and named in the title; each of the four
layers, at four times its light, lights the trails one and a half times as
much as at a quarter of it, or more, kept as curves and as the image carried.
On the screen the trails' light goes through a curve that fills: in the three
engines, four times a layer's light shows 2.4 to 3.1 times as much as a
quarter of it, and in Chromium 1.5 to 1.7 times as much as the light it is
born with. In the browser, side by side with the code before, on the page's
own clock: the fifty-eight cases of before the same, byte for byte.

## 103. A report's buffers go back to its worker, to be filled again

*2026-11-23.* A worker that carries a share of the twins (decision 51) sent
each report in buffers handed over to the page, made anew each frame. The
page now hands each buffer back with that worker's next command once it has
done with it, and the worker fills it again: a report's curves (decision 97)
once taken into the trails, and its twins' places and tips once the worker's
next report is shown, so that a worker that comes late leaves its twins drawn
where it last put them. Each worker's newest open curves, kept for a view
drawn anew, are copied. A worker keeps at most three buffers of a kind, and
makes one with room to spare where none fits. The twins on the main line make
theirs anew, of their exact sizes, as before. What is drawn does not change.

**Why.** With two masses and 4 096 twins in seven workers, the reports
brought the page about 100 MB a second for its collector to free. On a
desktop, the main line ran a full collection about twice a second, each
followed by the browser sweeping its own objects for 11 to 21 ms, which made
the next frame late.

**Evidence.** Unit tests: with its buffers handed back, a share fills them
and reports the same, number for number and span for span, as one handed
none, through births, drops, splits, other masses, time run backwards, stamps
and curves let go; on the main line each buffer is made anew. The page hands
back curves once taken and numbers once the next report is shown or the fan
is put out, and keeps a late worker's twins drawn where its last report put
them, the buffers moved as a worker's message moves them. On the desktop,
traces of a page from the disk with two masses and 4 096 twins, about 41 s
each, before and after: full collections on the main line from 81 to 3, its
time collecting from 1.4 to 0.25 s, the longest stretch from 21 to 8.5 ms,
and late frames from 10 to none but the recording's first. Sending the
buffers back costs the main line about 0.2 ms a frame, and the minor
collections grew longer, up to 6.4 ms, none making a frame late. In the
browser, side by side with the code before, on the page's own clock with the
twins on the main line: 51 cases, the screen the same, byte for byte.

## 104. Thirty-six palettes, for the twins and the tension

*2026-11-23.* The twins, the tension and the white's dots (decision 61) take
their colours from one list of thirty-six palettes, in place of the ten
palettes of decisions 23 and 41 and the four scales of decisions 35 and 41.
Each palette has seven colours, all different, in order, and is open or
closed: a closed one's last colour leads back to its first, so that a fan all
the way round (decision 63) shows no seam; seven are closed. The list opens
with dusk, the sketch's ramp, kept as the function it was, and goes round the
circle of hues, with the palettes of many colours and the greys at the end.
The tension puts a palette's seven colours at a push, a slack rod, half a
weight, and 2, 4, 8 and 16 weights, with the chain's own colour at one
weight; it opens with heat, decision 35's scale on those places. The keys and
the row step through the thirty-six, each shown as its seven colours; off,
the tension's control comes on in the palette it had. The address names a
palette, as `?palette=jellyfish&scale=black-body`. The numbers that addresses
and codes wrote before open the palette that took their place: the same
name, or the nearest (ice is cobalt now, blossom safflower, meadow green
line, neon nebula; the scales incandescent, neon and verdant are black body,
nebula and copper). The saved moment's code is of version 14.

**Why.** A ramp through seven colours strays from a smooth one a third as
much as one through five, which sits at the edge of what the eye notices;
seven colours have a middle, and are about as many as are found at a glance
(Healey, 1996). The palettes come from the light of physics, computed from
spectra, from the colour maps of science, and from art, nature and culture,
each measured in OKLab and looked at in the piece, whose trails lift every
colour towards white: they sit bright and saturated. Each one's source is
beside it in `web/src/core/palettes.ts`, and the README credits them.

**Evidence.** Unit tests: every palette has seven colours at least 0.03
apart in OKLab, in steps within 3.5 times of each other (heat's 3.7, where
the chain's own colour stands), none darker than 0.45 in OKLab, nor than 0.55
unless vivid; heat paints the tension on the first ground within half a level
of 255 of decision 35's scale; the address writes and reads every name, and
the old numbers and the codes of versions 1 to 13 open the palettes that took
their places. Browser tests: the keys, the row's seven dots, the names in the
address and an old number. In the browser, side by side with the code before,
on the page's own clock: eleven cases the same, byte for byte, the tension's
on the first ground among them; with more masses, or the strobe, the tension
differs by a level or two of 255, and on another ground by up to 12, where
half a weight is now the first ground's mix.

## Open

- **Dimension.** The first piece is planar; depth may come with later pieces.
- **Frame budget and target devices.** The chain's physics has 6 ms a frame
  and the twins, in workers, the frame's free time (decision 51); drawing
  the twins has no budget of its own. Real devices will set the numbers.
- **Which browser versions** count as the major browsers.
- **Accessibility.** Keyboard control and a pause always within reach from the
  start; reduced motion and the rest still to be decided.
- **Languages.**
- **Visual identity.**
- **Friction.** It is not in the paper. Whether the first piece has it, and of
  which kind, is open.
- **The order in which parameters arrive.**
