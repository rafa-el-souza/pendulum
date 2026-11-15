"""Accuracy and cost study of chain.py, printed as Markdown tables.

Every float64 result is compared with highprec.py, which treats the same float64
inputs as exact numbers and works at 40 to 100 significant digits.  Metrics, all
maxima over the samples of a row:

- alpha, T:   normwise relative error  max_i |x_i - x_ref_i| / max_i |x_ref_i|
- termwise:   max_i |alpha_i - alpha_ref_i| / sigma_i, where l_i sigma_i is the
              sum of the magnitudes of the terms that make up l_i alpha_i
              (|T_{i+1} s_i| / m_i, |T_{i-1} s_{i-1}| / m_{i-1}, g |sin theta_1|)
- compwise:   max_i |alpha_i - alpha_ref_i| / |alpha_ref_i| over the components
              with |alpha_ref_i| > 1e-8 max |alpha_ref|

Run from physics/oracle:  python chain/accuracy.py   (about 20 seconds).
"""

import time

import dense
import highprec
import numpy as np

import chain

G = 9.81
EXACT_JOINT_SIN_COS = chain._joint_sin_cos


def naive_joint_sin_cos(theta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The joint sines and cosines without the exact difference, for comparison."""
    joint = np.diff(theta)
    return np.sin(joint), np.cos(joint)


def metrics(state, dps: int, solver=chain.solve) -> np.ndarray:
    theta, omega, m, lengths, g = state
    alpha, tension = solver(theta, omega, m, lengths, g)[:2]
    ref_alpha, ref_tension = highprec.solve_float(theta, omega, m, lengths, g, dps=dps)
    err = np.abs(alpha - ref_alpha)
    scale = np.max(np.abs(ref_alpha))
    s = EXACT_JOINT_SIN_COS(theta)[0]
    sigma = np.zeros(theta.size)
    sigma[:-1] += np.abs(ref_tension[1:] * s) / m[:-1]
    sigma[1:] += np.abs(ref_tension[:-1] * s) / m[:-1]
    sigma[0] += g * abs(np.sin(theta[0]))
    sigma /= lengths
    big = np.abs(ref_alpha) > 1e-8 * scale
    termwise = np.max(err[sigma > 0] / sigma[sigma > 0]) if (sigma > 0).any() else 0.0
    return np.array(
        [
            np.max(err) / scale if scale > 0 else np.max(err),
            np.max(np.abs(tension - ref_tension)) / np.max(np.abs(ref_tension)),
            termwise,
            np.max(err[big] / np.abs(ref_alpha[big])) if big.any() else 0.0,
        ]
    )


def random_state(rng, n, spread=10.0, speed=1.0, angle=np.pi):
    m = spread ** rng.uniform(-1, 1, n)
    lengths = 5.0 ** rng.uniform(-1, 1, n)
    theta = rng.uniform(-angle, angle, n)
    omega = rng.normal(0.0, speed, n) * np.sqrt(G / lengths)
    return theta, omega, m, lengths, G


def adversarial_state(rng):
    """n <= 6 with masses over 24 decades, lengths over 6, and joints that are
    exactly straight, nearly straight, nearly folded or arbitrary."""
    n = int(rng.integers(1, 7))
    m = 10 ** rng.uniform(-12, 12, n)
    lengths = 10 ** rng.uniform(-3, 3, n)
    g = 10 ** rng.uniform(-2, 2)
    theta = np.empty(n)
    theta[0] = rng.uniform(-np.pi, np.pi)
    for i in range(1, n):
        kind = rng.integers(0, 4)
        tiny = rng.choice([-1, 1]) * 10 ** rng.uniform(-14, 0)
        if kind == 0:
            theta[i] = rng.uniform(-np.pi, np.pi)
        elif kind == 1:
            theta[i] = theta[i - 1] + tiny
        elif kind == 2:
            theta[i] = theta[i - 1] + np.pi + tiny
        else:
            theta[i] = theta[i - 1]
    omega = rng.choice([-1, 1], n) * 10 ** rng.uniform(-4, 3, n) * np.sqrt(g / lengths)
    if rng.uniform() < 0.2:
        omega[:] = 0.0
    return theta, omega, m, lengths, g


def row(label, n, samples, worst):
    cells = " | ".join(f"{x:.1e}" for x in worst)
    print(f"| {label} | {n} | {samples} | {cells} |")


def header(title):
    print(f"\n### {title}\n")
    print("| regime | n | samples | alpha | T | termwise | compwise |")
    print("|---|---|---|---|---|---|---|")


def main() -> None:
    rng = np.random.default_rng(20261115)

    header("Random states: masses in [0.1, 10], lengths in [0.2, 5], angles in [-pi, pi]")
    for speed, label in [(1.0, "omega ~ sqrt(g/l)"), (10.0, "omega ~ 10 sqrt(g/l)")]:
        for n, samples in [
            (1, 50),
            (2, 50),
            (3, 50),
            (5, 50),
            (8, 50),
            (16, 30),
            (64, 10),
            (256, 5),
            (1024, 3),
            (4096, 2),
            (16384, 1),
        ]:
            worst = np.zeros(4)
            for _ in range(samples):
                worst = np.maximum(worst, metrics(random_state(rng, n, speed=speed), dps=40))
            row(label, n, samples, worst)

    header("dense.py (KKT, LU) on the same kind of random states")
    for n, samples in [(1, 50), (8, 50), (64, 10), (256, 3)]:
        worst = np.zeros(4)
        for _ in range(samples):
            st = random_state(rng, n, speed=10.0)
            worst = np.maximum(worst, metrics(st, dps=40, solver=dense.solve))
        row("dense, omega ~ 10 sqrt(g/l)", n, samples, worst)

    header("Long chains of equal masses, total length 1")
    for n in [256, 1024, 4096, 16384]:
        lengths = np.full(n, 1.0 / n)
        theta = rng.normal(0.0, 1e-2, n)
        omega = rng.normal(0.0, 1e-2, n)
        row("nearly straight, hanging", n, 1, metrics((theta, omega, np.ones(n), lengths, G), 40))
        theta = np.pi + rng.normal(0.0, 1e-2, n)
        row("nearly straight, inverted", n, 1, metrics((theta, omega, np.ones(n), lengths, G), 40))
        arc = np.arange(1, n + 1) / n
        theta = 0.5 * np.sin(np.pi * arc)
        omega = 0.3 * np.cos(np.pi * arc)
        row("smooth swinging shape", n, 1, metrics((theta, omega, np.ones(n), lengths, G), 40))

    header("Extreme mass ratios: masses log-uniform in [10^-k, 10^k]")
    for n in [8, 64]:
        for k in [3, 6, 12]:
            worst = np.zeros(4)
            for _ in range(10):
                worst = np.maximum(worst, metrics(random_state(rng, n, spread=10.0**k), dps=80))
            row(f"k = {k}", n, 10, worst)

    header("Centripetal dominance: omega ~ W sqrt(g/l)")
    for w in [1e2, 1e4, 1e6]:
        worst = np.zeros(4)
        for _ in range(10):
            worst = np.maximum(worst, metrics(random_state(rng, 16, speed=w), dps=40))
        row(f"W = {w:.0e}", 16, 10, worst)

    header("Angles far beyond one turn: theta uniform in [-A, A]")
    original = EXACT_JOINT_SIN_COS
    for a in [1e3, 1e6, 1e9]:
        states = [random_state(rng, 16, angle=a) for _ in range(10)]
        worst = np.zeros(4)
        for st in states:
            worst = np.maximum(worst, metrics(st, dps=40))
        row(f"A = {a:.0e}", 16, 10, worst)
        chain._joint_sin_cos = naive_joint_sin_cos
        worst = np.zeros(4)
        for st in states:
            worst = np.maximum(worst, metrics(st, dps=40))
        chain._joint_sin_cos = original
        row(f"A = {a:.0e}, rounded joint difference", 16, 10, worst)

    header("Adversarial small chains (n <= 6): masses over 24 decades, folded joints")
    states = [adversarial_state(rng) for _ in range(3000)]
    for label, variant in [
        ("exact joint difference", original),
        ("rounded joint difference", naive_joint_sin_cos),
    ]:
        chain._joint_sin_cos = variant
        results = np.array([metrics(st, dps=100) for st in states])
        chain._joint_sin_cos = original
        row(f"{label}, worst", "1-6", len(states), results.max(axis=0))
        row(f"{label}, 99th percentile", "1-6", len(states), np.quantile(results, 0.99, axis=0))

    print("\n### Cost of one call of chain.solve\n")
    print("| n | seconds |")
    print("|---|---|")
    for n in [10, 1000, 100_000, 1_000_000]:
        st = random_state(rng, n)
        reps = max(1, 100_000 // n)
        start = time.perf_counter()
        for _ in range(reps):
            chain.solve(*st)
        print(f"| {n} | {(time.perf_counter() - start) / reps:.2e} |")


if __name__ == "__main__":
    main()
