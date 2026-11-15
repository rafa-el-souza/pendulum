"""Literal transcriptions of the paper's display equations (48)-(85), keyed by printed number.

Paper: B. Yesilyurt, "Equations of Motion Formulation of a Pendulum Containing N-point Masses",
arXiv:1910.12610v2. Numbers are the ones printed in the PDF.

Transcription rules: a term printed without a factor has no factor, an exponent sits where it is
printed, a stray symbol stays as a free parameter. Where a printed form is a misprint the
corrected form sits beside it (``*_printed`` / ``*_corrected``) and ``ERRATA`` records both.

Index convention, as in the paper: sequences are indexed from 1. For angles, rates, masses and
lengths index 0 is an unused placeholder. For the horizontal displacements of section 5, index 0
is the pivot, x_0 = 0 ("For k=1, we have x_0 = 0"); some printed sums reach x_{n+1} or x_{n+2}
at the last masses, so those arrays may carry such "phantom" entries (see (60) and (65)).

sigma_{jk} = 1 if j <= k else 0 and phi_{jk} = 0 if j = k else 1 (the paper's section 2), and
the printed (sum_{q >= k}^{n} m_q sigma_{jq}) is read as sum over q = k..n.
"""

import sympy


def sigma(j, k):
    return 1 if j <= k else 0


def phi(j, k):
    return 0 if j == k else 1


def tail(j, k, n, m):
    """The printed factor (sum_{q >= k}^{n} m_q sigma_{jq})."""
    return sum(m[q] * sigma(j, q) for q in range(k, n + 1))


# --- (38), only as the starting point of section 4 (its own verdict is not made here) ---------


def eq38(j, n, th, dth, ddth, m, l, g, sin, cos):
    """Left side of (38) with pluggable sin and cos, so that (48)-(49) can be substituted."""
    total = 0
    for k in range(1, n + 1):
        s = tail(j, k, n, m)
        total = total + (
            g * l[j] * sin(th[j]) * m[k] * sigma(j, k)
            + m[k] * l[j] ** 2 * ddth[j] * sigma(j, k)
            + s * l[j] * l[k] * sin(th[j] - th[k]) * dth[j] * dth[k]
            + s
            * l[j]
            * l[k]
            * (
                sin(th[k] - th[j]) * (dth[j] - dth[k]) * dth[k]
                + phi(j, k) * cos(th[j] - th[k]) * ddth[k]
            )
        )
    return total


# --- section 4 ---------------------------------------------------------------------------------


def eq48(theta):
    """(48): sin(theta) ~ theta, the approximant."""
    return theta


def eq49(theta):
    """(49): cos(theta) ~ 1 - theta^2/2, the approximant."""
    return 1 - theta**2 / 2


def eq50_first(j, n, th, dth, ddth, m, l, g):
    """(50), first member."""
    total = 0
    for k in range(1, n + 1):
        s = tail(j, k, n, m)
        total = total + (
            g * l[j] * th[j] * m[k] * sigma(j, k)
            + m[k] * l[j] ** 2 * ddth[j] * sigma(j, k)
            + s * l[j] * l[k] * (th[j] - th[k]) * dth[j] * dth[k]
            + s
            * l[j]
            * l[k]
            * (
                (th[k] - th[j]) * (dth[j] - dth[k]) * dth[k]
                + phi(j, k) * (1 - (th[j] - th[k]) ** 2 / 2) * ddth[k]
            )
        )
    return total


def _bracket_50_51(j, k, th, ddth):
    """The bracket [-theta_k thetadot_k^2 + ...] shared by (50) second member and (51), minus
    its first term (which needs the rate)."""
    return (
        phi(j, k) * ddth[k]
        - phi(j, k) * ddth[k] * th[j] ** 2 / 2
        - phi(j, k) * ddth[k] * th[k] ** 2 / 2
        + th[k] * th[j] * phi(j, k) * ddth[k]
    )


def eq50_second(j, n, th, dth, ddth, m, l, g):
    """(50), second member (after the first '=')."""
    total = 0
    for k in range(1, n + 1):
        s = tail(j, k, n, m)
        total = total + (
            th[j] * (g * l[j] * m[k] * sigma(j, k))
            + m[k] * l[j] ** 2 * ddth[j] * sigma(j, k)
            + th[j] * s * l[j] * l[k] * dth[k] ** 2
            + s * l[j] * l[k] * (-th[k] * dth[k] ** 2 + _bracket_50_51(j, k, th, ddth))
        )
    return total


def eq51(j, n, th, dth, ddth, m, l, g):
    """(51)."""
    total = 0
    for k in range(1, n + 1):
        s = tail(j, k, n, m)
        total = total + (
            th[j] * (g * l[j] * m[k] * sigma(j, k))
            + m[k] * l[j] ** 2 * ddth[j] * sigma(j, k)
            + s * l[j] * l[k] * th[j] * dth[k] ** 2
            + s * l[j] * l[k] * (-th[k] * dth[k] ** 2 + _bracket_50_51(j, k, th, ddth))
        )
    return total


def eq52_lines(th1, dth1, ddth1, m1, l1, g):
    """(52), its three lines for n = 1, j = 1; in the last line the printed l is l_1."""
    first = (
        th1 * g * l1 * m1
        + m1 * l1**2 * ddth1
        + th1 * m1 * l1**2 * dth1**2
        - th1 * m1 * l1**2 * dth1**2
        + 0
        - 0
        - 0
        + 0
    )
    second = th1 * g * l1 * m1 + m1 * l1**2 * ddth1
    third = ddth1 + g / l1 * th1
    return first, second, third


def eq53(th, dth, ddth, m, l, g, third_term_rate_factor):
    """(53) with its third term's rate factor passed in, so both readings use one transcription.

    The third term is printed theta_1 (m_1+m_2) l_1^2 \\dot{\\theta_1^2}: the dot sits over the
    group theta_1^2 (PDF page 11), i.e. d(theta_1^2)/dt = 2 theta_1 thetadot_1.
    """
    return (
        g * l[1] * th[1] * m[1]
        + m[1] * l[1] ** 2 * ddth[1]
        + th[1] * (m[1] + m[2]) * l[1] ** 2 * third_term_rate_factor
        - (m[1] + m[2]) * th[1] * dth[1] ** 2 * l[1] ** 2
        + th[1] * g * l[1] * m[2]
        + m[2] * l[1] ** 2 * ddth[1]
        + th[1] * m[2] * l[1] * l[2] * dth[2] ** 2
        - m[2] * l[1] * l[2] * th[2] * dth[2] ** 2
        + (m[2])
        * l[1]
        * l[2]
        * (ddth[2] - th[1] ** 2 / 2 * ddth[2] - th[2] ** 2 / 2 * ddth[2] + th[1] * th[2] * ddth[2])
    )


def eq53_printed(th, dth, ddth, m, l, g):
    """(53) as printed: \\dot{\\theta_1^2} = d(theta_1^2)/dt = 2 theta_1 thetadot_1."""
    return eq53(th, dth, ddth, m, l, g, 2 * th[1] * dth[1])


def eq53_corrected(th, dth, ddth, m, l, g):
    """(53) with the dot over theta_1 alone: (thetadot_1)^2."""
    return eq53(th, dth, ddth, m, l, g, dth[1] ** 2)


# --- section 5: the linearized equation --------------------------------------------------------


def eq54(j, n, th, ddth, m, l, g):
    """(54)."""
    total = 0
    for k in range(1, n + 1):
        total = total + (
            th[j] * (g * l[j] * m[k] * sigma(j, k))
            + m[k] * l[j] ** 2 * ddth[j] * sigma(j, k)
            + tail(j, k, n, m) * l[j] * l[k] * phi(j, k) * ddth[k]
        )
    return total


def eq55(total_mass, total_length):
    """(55): mu = M / L."""
    return total_mass / total_length


# Equal masses m and lengths l from here on (the section's second assumption); the angles are
# the sixth assumption theta_j = (x_j - x_{j-1}) / l, applied to the paper's theta-sums.


def angles_from_x(x, l, n):
    """theta_j = (x_j - x_{j-1}) / l for j = 1..n, 1-based with a placeholder at 0."""
    return [None] + [(x[j] - x[j - 1]) / l for j in range(1, n + 1)]


def _uniform(n, value):
    return [None] + [value] * n


def eq56(j, n, x, m, l, g):
    """(56): (first sum of (54) in theta, middle member, right member)."""
    th = angles_from_x(x, l, n)
    ms, ls = _uniform(n, m), _uniform(n, l)
    left = sum(th[j] * g * ls[j] * ms[k] * sigma(j, k) for k in range(1, n + 1))
    middle = sum(g * l * m * sigma(j, k) * (x[j] - x[j - 1]) / l for k in range(1, n + 1))
    right = (n - j + 1) * m * l * g * (x[j] - x[j - 1]) / l
    return left, middle, right


def eq57(j, n, xdd, m, l):
    """(57): (second sum of (54) in theta, middle member, right member)."""
    thdd = angles_from_x(xdd, l, n)
    ms, ls = _uniform(n, m), _uniform(n, l)
    left = sum(thdd[j] * ls[j] ** 2 * ms[k] * sigma(j, k) for k in range(1, n + 1))
    middle = sum(l**2 * m * sigma(j, k) * (xdd[j] - xdd[j - 1]) / l for k in range(1, n + 1))
    right = (n - j + 1) * m * l**2 * (xdd[j] - xdd[j - 1]) / l
    return left, middle, right


def third_sum(j, n, xdd, m, l, ks):
    """The third sum of (54), sum_k (sum_{q>=k} m_q sigma_jq) l_j l_k phi_jk theta''_k over ks."""
    thdd = angles_from_x(xdd, l, n)
    ms, ls = _uniform(n, m), _uniform(n, l)
    return sum(tail(j, k, n, ms) * ls[j] * ls[k] * phi(j, k) * thdd[k] for k in ks)


def eq58(j, n, xdd, m, l):
    """(58): (k < j part of the third sum, right member)."""
    left = third_sum(j, n, xdd, m, l, range(1, j))
    right = sum(m * l**2 * (n - j + 1) * (xdd[k] - xdd[k - 1]) / l for k in range(1, j))
    return left, right


def eq59(j, n, xdd, m, l):
    """(59): (k < j part of the third sum, right member)."""
    left = third_sum(j, n, xdd, m, l, range(1, j))
    right = (n - j + 1) * m * l**2 * xdd[j - 1] / l
    return left, right


def eq60(j, n, xdd, m, l):
    """(60): (k > j part of the third sum, middle member, right member).

    The middle and right members name xdd_{j+1} and xdd_{j+2} explicitly, so for j >= n - 1
    they reach past the last mass: ``xdd`` must then carry entries up to index j + 2.
    """
    left = third_sum(j, n, xdd, m, l, range(j + 1, n + 1))
    rest = sum((n - k + 1) * (xdd[k] - xdd[k - 1]) for k in range(j + 3, n + 1))
    middle = (
        m
        * l**2
        / l
        * ((n - j) * (xdd[j + 1] - xdd[j]) + (n - j - 1) * (xdd[j + 2] - xdd[j + 1]) + rest)
    )
    right = m * l**2 / l * (-(n - j) * xdd[j] + xdd[j + 1] + (n - j - 1) * xdd[j + 2] + rest)
    return left, middle, right


def eq61(j, n, xdd, m, l):
    """(61): (k > j part of the third sum, right member)."""
    left = third_sum(j, n, xdd, m, l, range(j + 1, n + 1))
    right = m * l**2 / l * (-(n - j) * xdd[j] + sum(xdd[k] for k in range(j + 1, n + 1)))
    return left, right


def eq62(j, n, x, xdd, m, l, g, s):
    """(62) with its trailing printed symbol s as a free factor."""
    return (
        (n - j + 1) * m * l * g * (x[j] - x[j - 1]) / l
        + (n - j + 1) * m * l**2 * (xdd[j] - xdd[j - 1]) / l
        + (n - j + 1) * m * l**2 * xdd[j - 1] / l
        + m * l**2 / l * (-(n - j) * xdd[j] + sum(xdd[k] for k in range(j + 1, n + 1))) * s
    )


def eq62_printed(j, n, x, xdd, m, l, g, s):
    """(62) as printed: '... + sum_{k=j+1}^n xdd_k)s = 0' -- s is undefined in the paper."""
    return eq62(j, n, x, xdd, m, l, g, s)


def eq62_corrected(j, n, x, xdd, m, l, g):
    """(62) without the stray s."""
    return eq62(j, n, x, xdd, m, l, g, 1)


def eq63(j, n, x, xdd, m, l, g):
    """(63), left side."""
    return (
        (n - j + 1) * m * l * g * (x[j] - x[j - 1]) / l
        + m * l**2 / l * xdd[j]
        + m * l**2 / l * sum(xdd[k] for k in range(j + 1, n + 1))
    )


def eq64(j, n, x, xdd, m, l, g):
    """(64): (left member, right member)."""
    left = m * l**2 / l * sum(xdd[k] for k in range(j, n + 1))
    right = -(n - j + 1) * m * l * g * (x[j] - x[j - 1]) / l
    return left, right


def eq65(j, n, x, xdd, l, g):
    """(65), left side. At j = n it names x_{n+1}, with the coefficient n - j = 0."""
    return xdd[j] - (n - j) * g * (x[j + 1] - x[j]) / l + (n - j + 1) * g * (x[j] - x[j - 1]) / l


def eq66_rhs(j, n_p, l_p, x, g):
    """(66), right side, with the sequential n_p and l_p."""
    return g * ((n_p - j) * (x[j + 1] - 2 * x[j] + x[j - 1]) / l_p - (x[j] - x[j - 1]) / l_p)


# --- section 5: the limit p -> infinity --------------------------------------------------------


def sequential(n, l, m, p):
    """The paper's (n_p) = n 2^p, (l_p) = l / 2^p, (m_p) = m / 2^p."""
    return n * 2**p, l / 2**p, m / 2**p


def eq68_lhs(x, j):
    """(68): the quantity whose limit is claimed to be 0."""
    return x[j + 1] - x[j]


def eq69(x, j, l, p):
    """(69): (left member before the limit, right member before the limit)."""
    l_p = l / 2**p
    return (x[j] - x[j - 1]) / l_p, (x[j] - x[j - 1]) / (l / 2**p)


def eq70_lhs(x, j, l, p):
    """(70), the quantity under the limit."""
    return (x[j] - x[j - 1]) / (l / 2**p)


def eq71_lhs(n_p, l_p, j):
    """(71), the quantity under the limit."""
    return n_p * l_p - l_p * j


def eq72(x, j, n_p, l_p):
    """(72): (left member before the limit, right member before the limit)."""
    second_difference = x[j + 1] - 2 * x[j] + x[j - 1]
    left = (n_p - j) * second_difference / l_p
    right = (n_p - j) * (l_p / l_p) * second_difference / l_p
    return left, right


def eq73_lhs(x, j, n_p, l_p):
    """(73), the quantity under the limit."""
    return (n_p - j) * (l_p / l_p) * (x[j + 1] - 2 * x[j] + x[j - 1]) / l_p


def eq73_rhs(L, y, x_yy):
    return (L - y) * x_yy


def eq74_rhs(L, y, x_y, x_yy, g):
    """(74) and (81), right side: g (L - y) x_yy - g x_y."""
    return g * (L - y) * x_yy - g * x_y


# --- section 5: the rope's Lagrangian ----------------------------------------------------------

y, t = sympy.symbols("y t", real=True)
L_rope, g_sym, mu_sym, K_sym = sympy.symbols("L g mu K", positive=True)
x_field = sympy.Function("x", real=True)(y, t)
# Placeholders for x, x_t, x_y inside a Lagrange density.
u, u_t, u_y = sympy.symbols("u u_t u_y", real=True)


def eq75(density):
    """(75): d/dt dL/d(x_t) + d/dy dL/d(x_y) - dL/dx for a density in (u, u_t, u_y, y, t)."""
    on_field = {u: x_field, u_t: sympy.diff(x_field, t), u_y: sympy.diff(x_field, y)}
    term_t = sympy.diff(sympy.diff(density, u_t).subs(on_field), t)
    term_y = sympy.diff(sympy.diff(density, u_y).subs(on_field), y)
    term_x = sympy.diff(density, u).subs(on_field)
    return term_t + term_y - term_x


def eq77_dl_per_dy(x_y):
    """(77), first line: dl/dy = 1 + (x_y)^2 / 2."""
    return 1 + x_y**2 / 2


def eq77_dh_per_dy(x_y):
    """(77), second line: dh/dy = (x_y)^2 / 2."""
    return x_y**2 / 2


def eq77_du_per_dy(x_y, y_value, L, g, mu):
    """(77), third line: dU/dy = g (L - y) mu (x_y)^2 / 2."""
    return g * (L - y_value) * mu * x_y**2 / 2


def eq78_dt_per_dy(x_t, x_y, mu):
    """(78): dT/dy = mu (dl/dy) (x_t)^2 / 2 with dl/dy from (77)."""
    return mu * eq77_dl_per_dy(x_y) * x_t**2 / 2


def eq79_dt_per_dy(x_t, mu):
    """(79): dT/dy = mu (x_t)^2 / 2."""
    return mu * x_t**2 / 2


def eq80_integrand(x_t, x_y, y_value, L, g, mu):
    """(80): the printed integrand mu x_t^2 - g (L - y) mu x_y^2; the 1/2 stands outside."""
    return mu * x_t**2 - g * (L - y_value) * mu * x_y**2


def eq80_density():
    """Lagrange density of (80) in the placeholders, including the printed 1/2."""
    return sympy.Rational(1, 2) * eq80_integrand(u_t, u_y, y, L_rope, g_sym, mu_sym)


def eq81_residual(field=None):
    """(81) moved to one side: x_tt - g (L - y) x_yy + g x_y."""
    f = x_field if field is None else field
    return (
        sympy.diff(f, t, 2) - g_sym * (L_rope - y) * sympy.diff(f, y, 2) + g_sym * sympy.diff(f, y)
    )


Psi = sympy.Function("Psi")
xi = sympy.Function("xi")


def eq82():
    """(82): x(y, t) = Psi(y) xi(t)."""
    return Psi(y) * xi(t)


def eq83_members():
    """(83): (1/xi) xi'', (g/Psi)((L - y) Psi'' - Psi'); both equal -K."""
    left = sympy.diff(xi(t), t, 2) / xi(t)
    middle = g_sym / Psi(y) * ((L_rope - y) * sympy.diff(Psi(y), y, 2) - sympy.diff(Psi(y), y))
    return left, middle


def eq84():
    """(84), left side: xi'' + K xi."""
    return sympy.diff(xi(t), t, 2) + K_sym * xi(t)


def eq85(psi=None):
    """(85), left side: (L - y) Psi'' - Psi' + (K/g) Psi."""
    f = Psi(y) if psi is None else psi
    return (L_rope - y) * sympy.diff(f, y, 2) - sympy.diff(f, y) + K_sym / g_sym * f


# --- errata and readings -----------------------------------------------------------------------


def _erratum(printed, wrong, right, change):
    """A correction is the printed LaTeX with exactly one substring replaced, nothing else."""
    assert printed.count(wrong) == 1, wrong
    return {
        "printed": printed,
        "corrected": printed.replace(wrong, right),
        "wrong": wrong,
        "right": right,
        "change": change,
    }


ERRATA = {
    "53": _erratum(
        r"gl_1\theta_1m_1+m_1l_1^2\ddot{\theta_1}+\theta_1(m_1+m_2)l_1^2\dot{\theta_1^2}"
        r"-(m_1+m_2)\theta_1\dot{\theta_1}^2l_1^2+\theta_1gl_1m_2+m_2l_1^2\ddot{\theta_1}"
        r"+\theta_1m_2l_1l_2\dot{\theta_2}^2-m_2l_1l_2\theta_2\dot{\theta_2}^2"
        r"+(m_2)l_1l_2(\ddot{\theta_2}-\frac{\theta_1^2}{2}\ddot{\theta_2}"
        r"-\frac{\theta_2^2}{2}\ddot{\theta_2}+\theta_1\theta_2\ddot{\theta_2})=0",
        r"\dot{\theta_1^2}",
        r"\dot{\theta_1}^2",
        "third term: the dot is printed over the group theta_1^2 (the time derivative of "
        "theta_1^2); it belongs over theta_1 alone, (thetadot_1)^2, as in the fourth term",
    ),
    "62": _erratum(
        r"(n-j+1)mlg\frac{(x_j-x_{j-1})}{l} + (n-j+1)ml^2\frac{(\ddot{x_j}-\ddot{x}_{j-1})}{l}"
        r"+(n-j+1)ml^2\frac{\ddot{x}_{j-1}}{l}"
        r"+\frac{ml^2}{l}(-(n-j)\ddot{x}_j+\sum_{k=j+1}^{n}\ddot{x}_k)s=0",
        r"\ddot{x}_k)s=0",
        r"\ddot{x}_k)=0",
        "the stray symbol s after the last parenthesis is deleted",
    ),
}

READINGS = {
    "60": (
        "the two terms written out are the k = j+1 and k = j+2 terms of the sum and exist only "
        "while j + 2 <= n (equivalently xdd_k := 0 for k > n); read literally at j = n the "
        "right side is (ml^2/l)(xdd_{n+1} - xdd_{n+2}) of masses that do not exist, not 0"
    ),
    "67": (
        "j is not fixed: j = j_p with j_p l_p -> y (j_p = y 2^p / l), and x_{j_p}(t) -> x(y, t) "
        "with its time derivatives; with j fixed the node runs into the pivot and the limit is "
        "x_tt(0, t) = 0"
    ),
    "70": "j = j_p with j_p l_p -> y, as in (67); with j fixed the limit is x_y(0, t)",
    "71": (
        "j = j_p with (l_p) j_p = y, which the sentence after (71) states; then the member is "
        "L - y exactly at every p; with j fixed the limit is L"
    ),
    "73": "j = j_p with j_p l_p -> y, as in (67); with j fixed the limit is L x_yy(0, t)",
}
