r"""Literal transcriptions of the display equations of sections 2, 3 and 6 of
B. Yesilyurt, "Equations of Motion Formulation of a Pendulum Containing N-point
Masses", arXiv:1910.12610v2, keyed by printed number.

Literal means literal: an exponent applies to what it is printed on, a factor that
is not printed is absent, a sin or cos typeset without its backslash is still the
function, and an upper summation limit printed as n=3 is the limit n with n = 3.
Each docstring carries the printed LaTeX, checked against the PDF. Where an
equation is a misprint, the corrected form sits beside it with the suffix
_corrected, so that the tests can assert that the printed form fails and the
corrected one holds.

A side that names a physical quantity (K_2, (dx_2/dt)^2+(dy_2/dt)^2, |\dot{R_n}|^2,
a derivative of T) is not transcribed: the function returns the explicit side(s),
and the test supplies the named quantity from lagrangian.py. Printed operations on
printed expressions (the derivatives in (45) and (46.2) to (46.4)) are carried out
here, on the transcribed expression.

Symbols, indexed from 1 as printed: th[i] = \theta_i, w[i] = \dot{\theta_i},
a[i] = \ddot{\theta_i}, d[i] = d\theta_i, m[i], l[i], and g (see lagrangian.symbols).
"""

from __future__ import annotations

import sympy as sp
from lagrangian import g, symbols, time_derivative

sin, cos = sp.sin, sp.cos
half = sp.Rational(1, 2)

# A symbol does not depend on the length of the chain it is used in, so one table
# long enough for every chain used here serves all the transcriptions.
_S = symbols(8)
th, w, a, d, m, l = _S.theta, _S.omega, _S.alpha, _S.dtheta, _S.m, _S.l


def _sum(terms):
    return sp.Add(*terms)


# Section 2: the simple pendulum (n = 1)


def eq_1():
    r"""\ddot{\theta}+\frac{g}{l}\sin(\theta)=0, with theta = theta_1, l = l_1.
    Returns the left-hand side."""
    return a[1] + g / l[1] * sin(th[1])


def eq_2():
    r"""L=T-U=\frac{1}{2}ml^2\dot{\theta}^2+mgl\cos(\theta). Returns the last side."""
    return half * m[1] * l[1] ** 2 * w[1] ** 2 + m[1] * g * l[1] * cos(th[1])


# Section 2: the double pendulum (n = 2)


def eq_3():
    r"""x_1=l_1\sin(\theta_1)"""
    return l[1] * sin(th[1])


def eq_4():
    r"""y_1=-l_1\cos(\theta_1)"""
    return -l[1] * cos(th[1])


def eq_5():
    r"""x_2=l_1\sin(\theta_1)+ l_2\sin(\theta_2)"""
    return l[1] * sin(th[1]) + l[2] * sin(th[2])


def eq_6():
    r"""y_2=-(l_1\cos(\theta_1)+ l_2\cos(\theta_2))"""
    return -(l[1] * cos(th[1]) + l[2] * cos(th[2]))


def eq_7():
    r"""dx_1=l_1\cos(\theta_1)d\theta_1\quad and \quad dy_1=l_1sin(\theta_1)d\theta_1.
    Returns (dx_1, dy_1)."""
    return (l[1] * cos(th[1]) * d[1], l[1] * sin(th[1]) * d[1])


def eq_8():
    r"""(dx_1/dt)^2+(dy_1/dt)^2=l_1^2\dot{\theta_1}^2"""
    return l[1] ** 2 * w[1] ** 2


def eq_9():
    r"""K_1=\frac{1}{2}m_1l_1^2\dot{\theta_1}^2"""
    return half * m[1] * l[1] ** 2 * w[1] ** 2


def eq_10():
    r"""U_1=-m_1gl_1\cos(\theta_1)"""
    return -m[1] * g * l[1] * cos(th[1])


def eq_11():
    r"""L_1=K_1-U_1=\frac{1}{2}m_1l_1^2\dot{\theta_1}^2+m_1gl_1\cos(\theta_1)."""
    return half * m[1] * l[1] ** 2 * w[1] ** 2 + m[1] * g * l[1] * cos(th[1])


def eq_12():
    r"""dx_2=l_1\cos(\theta_1)d\theta_1+l_2\cos(\theta_2)d\theta_2"""
    return l[1] * cos(th[1]) * d[1] + l[2] * cos(th[2]) * d[2]


def eq_13():
    r"""dy_2=l_1\sin(\theta_1)d\theta_1+l_2\sin(\theta_2)d\theta_2"""
    return l[1] * sin(th[1]) * d[1] + l[2] * sin(th[2]) * d[2]


def eq_14():
    r"""(dx_2/dt)^2+(dy_2/dt)^2= l_1^2\dot{\theta_1}+l_2^2\dot{\theta_2}^2
    +2l_1l_2\cos(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2}"""
    return (
        l[1] ** 2 * w[1]
        + l[2] ** 2 * w[2] ** 2
        + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
    )


def eq_14_corrected():
    r"""l_1^2\dot{\theta_1}^2 in place of l_1^2\dot{\theta_1}."""
    return (
        l[1] ** 2 * w[1] ** 2
        + l[2] ** 2 * w[2] ** 2
        + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
    )


def eq_15():
    r"""K_2=\frac{1}{2}m_2(l_1^2\dot{\theta_1}+l_2^2\dot{\theta_2}^2
    +l_1l_2\cos(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2})"""
    return (
        half
        * m[2]
        * (
            l[1] ** 2 * w[1]
            + l[2] ** 2 * w[2] ** 2
            + l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
        )
    )


def eq_15_corrected():
    r"""l_1^2\dot{\theta_1}^2 in place of l_1^2\dot{\theta_1}, and 2l_1l_2 in place of l_1l_2."""
    return (
        half
        * m[2]
        * (
            l[1] ** 2 * w[1] ** 2
            + l[2] ** 2 * w[2] ** 2
            + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
        )
    )


def eq_16():
    r"""U_2=-m_2g(l_1\cos(\theta_1)+ l_2\cos(\theta_2))"""
    return -m[2] * g * (l[1] * cos(th[1]) + l[2] * cos(th[2]))


def eq_17():
    r"""L_2=K_2-U_2=\frac{1}{2}m_2(l_1^2\dot{\theta_1}+l_2^2\dot{\theta_2}^2
    +2l_1l_2\cos(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2})
    +m_2g(l_1\cos(\theta_1)+ l_2\cos(\theta_2)). Returns the last side."""
    return half * m[2] * (
        l[1] ** 2 * w[1]
        + l[2] ** 2 * w[2] ** 2
        + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
    ) + m[2] * g * (l[1] * cos(th[1]) + l[2] * cos(th[2]))


def eq_17_corrected():
    r"""l_1^2\dot{\theta_1}^2 in place of l_1^2\dot{\theta_1}."""
    return half * m[2] * (
        l[1] ** 2 * w[1] ** 2
        + l[2] ** 2 * w[2] ** 2
        + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
    ) + m[2] * g * (l[1] * cos(th[1]) + l[2] * cos(th[2]))


def eq_18():
    r"""L=L_1+L_2=\frac{1}{2}m_1l_1^2\dot{\theta_1}^2+m_1gl_1\cos(\theta_1)
    +\frac{1}{2}m_2(l_1^2\dot{\theta_1}+l_2^2\dot{\theta_2}^2
    +2l_1l_2\cos(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2})
    +m_2g(l_1\cos(\theta_1)+ l_2\cos(\theta_2)). Returns the last side."""
    return (
        half * m[1] * l[1] ** 2 * w[1] ** 2
        + m[1] * g * l[1] * cos(th[1])
        + half
        * m[2]
        * (
            l[1] ** 2 * w[1]
            + l[2] ** 2 * w[2] ** 2
            + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
        )
        + m[2] * g * (l[1] * cos(th[1]) + l[2] * cos(th[2]))
    )


def eq_18_corrected():
    r"""l_1^2\dot{\theta_1}^2 in place of l_1^2\dot{\theta_1} in the m_2 term."""
    return (
        half * m[1] * l[1] ** 2 * w[1] ** 2
        + m[1] * g * l[1] * cos(th[1])
        + half
        * m[2]
        * (
            l[1] ** 2 * w[1] ** 2
            + l[2] ** 2 * w[2] ** 2
            + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
        )
        + m[2] * g * (l[1] * cos(th[1]) + l[2] * cos(th[2]))
    )


def eq_19():
    r"""(m_1+m_2)l_1^2\ddot{\theta_1}+m_2l_1l_2\ddot{\theta_2}cos(\theta_1-\theta_2)
    +m_2l_1l_2\dot{\theta_2}^2sin(\theta_1-\theta_2)+(m_1+m_2)l_1g\sin(\theta_1)=0.
    Returns the left-hand side."""
    return (
        (m[1] + m[2]) * l[1] ** 2 * a[1]
        + m[2] * l[1] * l[2] * a[2] * cos(th[1] - th[2])
        + m[2] * l[1] * l[2] * w[2] ** 2 * sin(th[1] - th[2])
        + (m[1] + m[2]) * l[1] * g * sin(th[1])
    )


def eq_20():
    r"""m_2l_2^2\ddot{\theta_2}+m_2l_1l_2\ddot{\theta_1}\cos(\theta_1-\theta_2)
    -m_2l_1l_2\dot{\theta_1}^2\sin(\theta_1-\theta_2)+m_2l_2g\sin(\theta_2)=0.
    Returns the left-hand side."""
    return (
        m[2] * l[2] ** 2 * a[2]
        + m[2] * l[1] * l[2] * a[1] * cos(th[1] - th[2])
        - m[2] * l[1] * l[2] * w[1] ** 2 * sin(th[1] - th[2])
        + m[2] * l[2] * g * sin(th[2])
    )


# Section 2: the triple pendulum (n = 3)


def eq_21():
    r"""x_1=l_1\sin(\theta_1) \quad y_1=-l_1\cos(\theta_1)"""
    return (l[1] * sin(th[1]), -l[1] * cos(th[1]))


def eq_22():
    r"""x_2=l_1\sin(\theta_1)+ l_2\sin(\theta_2)\quad y_2=-(l_1\cos(\theta_1)+ l_2\cos(\theta_2))"""
    return (l[1] * sin(th[1]) + l[2] * sin(th[2]), -(l[1] * cos(th[1]) + l[2] * cos(th[2])))


def eq_23():
    r"""x_3=l_1\sin(\theta_1)+ l_2\sin(\theta_2)+ l_3\sin(\theta_3)\quad
    y_3=-(l_1\cos(\theta_1)+ l_2\cos(\theta_2)+l_3\cos(\theta_3))"""
    return (
        l[1] * sin(th[1]) + l[2] * sin(th[2]) + l[3] * sin(th[3]),
        -(l[1] * cos(th[1]) + l[2] * cos(th[2]) + l[3] * cos(th[3])),
    )


def eq_24():
    r"""dx_3= \cos(\theta_1)l_1d\theta_1+\cos(\theta_2)l_2d\theta_2+\cos(\theta_3)l_3d\theta_3"""
    return cos(th[1]) * l[1] * d[1] + cos(th[2]) * l[2] * d[2] + cos(th[3]) * l[3] * d[3]


def eq_25():
    r"""dy_3= \sin(\theta_1)l_1d\theta_1+\sin(\theta_2)l_2d\theta_2+\sin(\theta_3)l_3d\theta_3"""
    return sin(th[1]) * l[1] * d[1] + sin(th[2]) * l[2] * d[2] + sin(th[3]) * l[3] * d[3]


def eq_26():
    r"""(dx_3)^2+(dy_3)^2 =l_1^2(d\theta_1)^2+l_2^2(d\theta_2)^2+l_3^2(d\theta_3)^2
    +2l_1l_2\cos(\theta_1-\theta_2)d\theta_1d\theta_2
    +(\theta_1-\theta_3)d\theta_1d\theta_3+ 2l_2l_3\cos(\theta_2-\theta_3)d\theta_2d\theta_3"""
    return (
        l[1] ** 2 * d[1] ** 2
        + l[2] ** 2 * d[2] ** 2
        + l[3] ** 2 * d[3] ** 2
        + 2 * l[1] * l[2] * cos(th[1] - th[2]) * d[1] * d[2]
        + (th[1] - th[3]) * d[1] * d[3]
        + 2 * l[2] * l[3] * cos(th[2] - th[3]) * d[2] * d[3]
    )


def eq_26_corrected():
    r"""2l_1l_3\cos(\theta_1-\theta_3)d\theta_1d\theta_3 in place of (\theta_1-\theta_3)d\theta_1d\theta_3."""
    return (
        l[1] ** 2 * d[1] ** 2
        + l[2] ** 2 * d[2] ** 2
        + l[3] ** 2 * d[3] ** 2
        + 2 * l[1] * l[2] * cos(th[1] - th[2]) * d[1] * d[2]
        + 2 * l[1] * l[3] * cos(th[1] - th[3]) * d[1] * d[3]
        + 2 * l[2] * l[3] * cos(th[2] - th[3]) * d[2] * d[3]
    )


def eq_27():
    r"""K_3 =\frac{1}{2}m_3(l_1^2(\dot{\theta_1})^2+l_2^2(\dot{\theta_2})^2+l_3^2(\dot{\theta_3})^2
    +2l_1l_2\cos(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2}
    +2l_1l_3\cos(\theta_1-\theta_3)\dot{\theta_1}\dot{\theta_3}
    +2l_2l_3\cos(\theta_2-\theta_3)\dot{\theta_2}\dot{\theta_3})"""
    return (
        half
        * m[3]
        * (
            l[1] ** 2 * w[1] ** 2
            + l[2] ** 2 * w[2] ** 2
            + l[3] ** 2 * w[3] ** 2
            + 2 * l[1] * l[2] * cos(th[1] - th[2]) * w[1] * w[2]
            + 2 * l[1] * l[3] * cos(th[1] - th[3]) * w[1] * w[3]
            + 2 * l[2] * l[3] * cos(th[2] - th[3]) * w[2] * w[3]
        )
    )


def eq_28():
    r"""U_3=-m_3g(l_1\cos(\theta_1)+ l_2\cos(\theta_2)+l_3\cos(\theta_3))"""
    return -m[3] * g * (l[1] * cos(th[1]) + l[2] * cos(th[2]) + l[3] * cos(th[3]))


def eq_29(kinetic_3, potential_3):
    r"""L_3=K_3-U_3 (a definition)."""
    return kinetic_3 - potential_3


# (30) to (32) as printed, term by term. The tag of each term is its type, the
# grouping that the pattern formulas (33) to (36) claim to account for:
# "gravity" (33), "diagonal" (34), "velocity" (35), "bracket" (36).


def eq_30():
    r"""gl_1(m_1\sin(\theta_1)+m_2\sin(\theta_1)+m_3\sin(\theta_1))
    +m_2l_1l_2\sin(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2}
    +m_3l_1l_3\sin(\theta_1-\theta_3)\dot{\theta_1}\dot{\theta_3}
    + m_3l_1l_2\sin(\theta_1-\theta_2)\dot{\theta_1}\dot{\theta_2} +l_1^2\ddot{\theta_1}(m_1+m_2+m_3)
    +m_2l_1l_2[\sin(\theta_2-\theta_1)(\dot{\theta_1}-\dot{\theta_2})\dot{\theta_2}
    +\cos(\theta_1-\theta_2)\ddot{\theta_2}]
    +m_3l_1l_2[sin(\theta_2-\theta_1)(\dot{\theta_1}-\dot{\theta_2})\dot{\theta_2}
    +\cos(\theta_1-\theta_2)\ddot{\theta_2}]
    +m_3l_1l_3[\sin(\theta_3-\theta_1)(\dot{\theta_1}-\dot{\theta_3})\dot{\theta_3}
    +\cos(\theta_1-\theta_3)\ddot{\theta_3}]=0.
    Returns the left-hand side as (tag, term) pairs in printed order."""
    return [
        ("gravity", g * l[1] * (m[1] * sin(th[1]) + m[2] * sin(th[1]) + m[3] * sin(th[1]))),
        ("velocity", m[2] * l[1] * l[2] * sin(th[1] - th[2]) * w[1] * w[2]),
        ("velocity", m[3] * l[1] * l[3] * sin(th[1] - th[3]) * w[1] * w[3]),
        ("velocity", m[3] * l[1] * l[2] * sin(th[1] - th[2]) * w[1] * w[2]),
        ("diagonal", l[1] ** 2 * a[1] * (m[1] + m[2] + m[3])),
        (
            "bracket",
            m[2]
            * l[1]
            * l[2]
            * (sin(th[2] - th[1]) * (w[1] - w[2]) * w[2] + cos(th[1] - th[2]) * a[2]),
        ),
        (
            "bracket",
            m[3]
            * l[1]
            * l[2]
            * (sin(th[2] - th[1]) * (w[1] - w[2]) * w[2] + cos(th[1] - th[2]) * a[2]),
        ),
        (
            "bracket",
            m[3]
            * l[1]
            * l[3]
            * (sin(th[3] - th[1]) * (w[1] - w[3]) * w[3] + cos(th[1] - th[3]) * a[3]),
        ),
    ]


def eq_31():
    r"""gl_2(m_2\sin(\theta_2)+m_3\sin(\theta_2))
    +\dot{\theta_1}\dot{\theta_2}l_1l_2\sin(\theta_2-\theta_1)[m_2+m_3]
    +m_3l_2l_3\sin(\theta_2-\theta_3)\dot{\theta_2}\dot{\theta_3} +l_2^2\ddot{\theta_2}(m_2+m_3)
    +(m_2+m_3)l_1l_2[\sin(\theta_2-\theta_1)(\dot{\theta_1}-\dot{\theta_2})\dot{\theta_1}
    +\cos(\theta_2-\theta_1)\ddot{\theta_1}]
    +m_3l_2l_3[\sin(\theta_3-\theta_2)(\dot{\theta_2}-\dot{\theta_3})\dot{\theta_3}
    +\cos(\theta_2-\theta_3)\ddot{\theta_3}]=0.
    Returns the left-hand side as (tag, term) pairs in printed order."""
    return [
        ("gravity", g * l[2] * (m[2] * sin(th[2]) + m[3] * sin(th[2]))),
        ("velocity", w[1] * w[2] * l[1] * l[2] * sin(th[2] - th[1]) * (m[2] + m[3])),
        ("velocity", m[3] * l[2] * l[3] * sin(th[2] - th[3]) * w[2] * w[3]),
        ("diagonal", l[2] ** 2 * a[2] * (m[2] + m[3])),
        (
            "bracket",
            (m[2] + m[3])
            * l[1]
            * l[2]
            * (sin(th[2] - th[1]) * (w[1] - w[2]) * w[1] + cos(th[2] - th[1]) * a[1]),
        ),
        (
            "bracket",
            m[3]
            * l[2]
            * l[3]
            * (sin(th[3] - th[2]) * (w[2] - w[3]) * w[3] + cos(th[2] - th[3]) * a[3]),
        ),
    ]


def eq_32():
    r"""m_3gl_3\sin(\theta_3)-m_3l_2l_3\sin(\theta_2-\theta_3)\dot{\theta_2}\dot{\theta_3}
    -m_3l_1l_3\sin(\theta_1-\theta_3)\dot{\theta_1}\dot{\theta_3}
    +m_3l_1l_3[\sin(\theta_3-\theta_1)(\dot{\theta_1}-\dot{\theta_3})\dot{\theta_1}
    +\cos(\theta_1-\theta_3)\ddot{\theta_1}]
    +m_3l_2l_3[\sin(\theta_3-\theta_2)(\dot{\theta_2}-\dot{\theta_3})\dot{\theta_2}
    +cos(\theta_2-\theta_3)\ddot{\theta_2}]+m_3l_3^2\ddot{\theta_3}=0.
    Returns the left-hand side as (tag, term) pairs in printed order."""
    return [
        ("gravity", m[3] * g * l[3] * sin(th[3])),
        ("velocity", -m[3] * l[2] * l[3] * sin(th[2] - th[3]) * w[2] * w[3]),
        ("velocity", -m[3] * l[1] * l[3] * sin(th[1] - th[3]) * w[1] * w[3]),
        (
            "bracket",
            m[3]
            * l[1]
            * l[3]
            * (sin(th[3] - th[1]) * (w[1] - w[3]) * w[1] + cos(th[1] - th[3]) * a[1]),
        ),
        (
            "bracket",
            m[3]
            * l[2]
            * l[3]
            * (sin(th[3] - th[2]) * (w[2] - w[3]) * w[2] + cos(th[2] - th[3]) * a[2]),
        ),
        ("diagonal", m[3] * l[3] ** 2 * a[3]),
    ]


# Section 2: the pattern formulas and the assembled equations


def sigma(j, k):
    r"""\sigma_{jk}= 0 if j>k, 1 if j\leq k"""
    return 0 if j > k else 1


def phi(j, k):
    r"""\phi_{jk}= 0 if j=k, 1 if j\neq k"""
    return 0 if j == k else 1


def mass_sum(j, k, n):
    r"""\sum_{q\geq k}^{n} m_q\sigma_{jq}"""
    return _sum(m[q] * sigma(j, q) for q in range(k, n + 1))


def eq_33(j, n=3):
    r"""\sum_{k=1}^{n=3} gl_j\sin(\theta_j)m_k\sigma_{jk}"""
    return _sum(g * l[j] * sin(th[j]) * m[k] * sigma(j, k) for k in range(1, n + 1))


def eq_34(j, n=3):
    r"""\sum_{k=1}^{n=3} m_kl_j^2\ddot{\theta_j}\sigma_{jk}."""
    return _sum(m[k] * l[j] ** 2 * a[j] * sigma(j, k) for k in range(1, n + 1))


def eq_35(j, n=3):
    r"""\sum_{k=1}^{n=3} (\sum_{q\geq k}^{n=3} m_q\sigma_{jq})l_jl_k\sin(\theta_j-\theta_k)
    \dot{\theta_j}\dot{\theta_k}"""
    return _sum(
        mass_sum(j, k, n) * l[j] * l[k] * sin(th[j] - th[k]) * w[j] * w[k] for k in range(1, n + 1)
    )


def eq_36(j, n=3, phi_=phi):
    r"""\sum_{k=1}^{n=3} (\sum_{q\geq k}^{n=3} m_q\sigma_{jq})l_jl_k[\sin(\theta_k-\theta_j)
    [\dot{\theta_j}-\dot{\theta_k}]\dot{\theta_k}+\phi_{jk}\cos(\theta_j-\theta_k)\ddot{\theta_k}]

    phi_ exists only so that a test can show what the formula gives without phi."""
    return _sum(
        mass_sum(j, k, n)
        * l[j]
        * l[k]
        * (sin(th[k] - th[j]) * (w[j] - w[k]) * w[k] + phi_(j, k) * cos(th[j] - th[k]) * a[k])
        for k in range(1, n + 1)
    )


def eq_37(j):
    r"""\sum_{k=1}^{n=3} \Big(gl_j\sin(\theta_j)m_k\sigma_{jk}+m_kl_j^2\ddot{\theta_j}\sigma_{jk}
    +(\sum_{q\geq k}^{n=3} m_q\sigma_{jq})l_jl_k\sin(\theta_j-\theta_k)\dot{\theta_j}\dot{\theta_k}
    + (\sum_{q\geq k}^{n=3} m_q\sigma_{jq})l_jl_k[\sin(\theta_k-\theta_j)[\dot{\theta_j}
    -\dot{\theta_k}]\dot{\theta_k}+\phi_{jk}\cos(\theta_j-\theta_k)\ddot{\theta_k}]\Big) =0.
    Returns the left-hand side."""
    n = 3
    return _sum(
        g * l[j] * sin(th[j]) * m[k] * sigma(j, k)
        + m[k] * l[j] ** 2 * a[j] * sigma(j, k)
        + mass_sum(j, k, n) * l[j] * l[k] * sin(th[j] - th[k]) * w[j] * w[k]
        + mass_sum(j, k, n)
        * l[j]
        * l[k]
        * (sin(th[k] - th[j]) * (w[j] - w[k]) * w[k] + phi(j, k) * cos(th[j] - th[k]) * a[k])
        for k in range(1, n + 1)
    )


def eq_38_terms(j, n, phi_=phi):
    r"""The four summands of (38), each summed over k:
    \sum_{k=1}^{n} \Big(gl_j\sin(\theta_j)m_k\sigma_{jk}+m_kl_j^2\ddot{\theta_j}\sigma_{jk}
    +(\sum_{q\geq k}^{n} m_q\sigma_{jq})l_jl_k\sin(\theta_j-\theta_k)\dot{\theta_j}\dot{\theta_k}
    + (\sum_{q\geq k}^{n} m_q\sigma_{jq})l_jl_k[\sin(\theta_k-\theta_j)[\dot{\theta_j}
    -\dot{\theta_k}]\dot{\theta_k}+\phi_{jk}cos(\theta_j-\theta_k)\ddot{\theta_k}]\Big) =0"""
    ks = range(1, n + 1)
    return {
        "gravity": _sum(g * l[j] * sin(th[j]) * m[k] * sigma(j, k) for k in ks),
        "diagonal": _sum(m[k] * l[j] ** 2 * a[j] * sigma(j, k) for k in ks),
        "velocity": _sum(
            mass_sum(j, k, n) * l[j] * l[k] * sin(th[j] - th[k]) * w[j] * w[k] for k in ks
        ),
        "bracket": _sum(
            mass_sum(j, k, n)
            * l[j]
            * l[k]
            * (sin(th[k] - th[j]) * (w[j] - w[k]) * w[k] + phi_(j, k) * cos(th[j] - th[k]) * a[k])
            for k in ks
        ),
    }


def eq_38(j, n):
    r"""(38): see eq_38_terms. Returns the left-hand side."""
    return _sum(eq_38_terms(j, n).values())


# Section 3: the vector method


def r_vector(i, n):
    r"""\vec{r_n}=l_n\sin(\theta_n)\hat{x}-l_n\cos(\theta_n)\hat{y}, defined in the text
    before (39); here for any rod i. Returns (x, y) components."""
    return (l[i] * sin(th[i]), -l[i] * cos(th[i]))


def _vector_sum(vectors):
    vectors = list(vectors)
    return (_sum(v[0] for v in vectors), _sum(v[1] for v in vectors))


def eq_39(n):
    r"""\vec{R_n}=\sum_{i=1}^{n} \vec{r_n}. The summand does not depend on i."""
    return _vector_sum(r_vector(n, n) for _ in range(1, n + 1))


def eq_39_corrected(n):
    r"""\vec{r_i} in place of \vec{r_n} under the sum."""
    return _vector_sum(r_vector(i, n) for i in range(1, n + 1))


def eq_40(n):
    r"""\dot{\vec{R_n}}=\sum_{i=1}^{n} l_i\dot{\theta_i}(\cos\theta_i\hat{x}+\sin\theta_i\hat{y})"""
    return _vector_sum(
        (l[i] * w[i] * cos(th[i]), l[i] * w[i] * sin(th[i])) for i in range(1, n + 1)
    )


def _dot(u, v):
    return u[0] * v[0] + u[1] * v[1]


def _speed_squared_41(n):
    r"""\sum_{i,j=1}^{n} l_il_j\dot{\theta_i}\dot{\theta_j}\cos(\theta_i-\theta_j)"""
    return _sum(
        l[i] * l[j] * w[i] * w[j] * cos(th[i] - th[j])
        for i in range(1, n + 1)
        for j in range(1, n + 1)
    )


def eq_41(n):
    r"""|{\dot{\vec{R_n}}}|^{2}=\vec{R_n}\cdot\vec{R_n}
    =\sum_{i,j=1}^{n} l_il_j\dot{\theta_i}\dot{\theta_j}\cos(\theta_i-\theta_j).
    Returns (middle, last); \vec{R_n} is the paper's position vector of mass n,
    taken from the corrected (39) so that only the misprint of (41) is tested."""
    position = eq_39_corrected(n)
    return (_dot(position, position), _speed_squared_41(n))


def eq_41_corrected(n):
    r"""\dot{\vec{R_n}}\cdot\dot{\vec{R_n}} in place of \vec{R_n}\cdot\vec{R_n}."""
    velocity = eq_40(n)
    return (_dot(velocity, velocity), _speed_squared_41(n))


def eq_42(n):
    r"""T=\sum_{k=1}^{n} \frac{1}{2}m_k|{\dot{\vec{R_n}}}|^{2}, with |\dot{\vec{R_n}}|^2 as
    the last side of (41). The summand's speed does not depend on k."""
    return _sum(half * m[k] * _speed_squared_41(n) for k in range(1, n + 1))


def eq_42_corrected(n):
    r"""|\dot{\vec{R_k}}|^2 in place of |\dot{\vec{R_n}}|^2 under the sum over k."""
    return _sum(half * m[k] * _speed_squared_41(k) for k in range(1, n + 1))


def _potential_43(n):
    return -g * _sum(
        m[i] * _sum(l[j] * cos(th[j]) for j in range(1, i + 1)) for i in range(1, n + 1)
    )


def eq_43(n):
    r"""U=\sum_{i=1}^{n} U_i = -g \sum_{i=1}^{n} m_i \sum_{j=1}^{i} l_j\cos\theta_j"""
    return _potential_43(n)


def eq_44(n):
    r"""L=T-U=\sum_{k=1}^{n} \frac{1}{2}m_k|{\dot{\vec{R_n}}}|^{2}
    +g \sum_{i=1}^{n} m_i \sum_{j=1}^{i} l_j\cos\theta_j. Returns the last side."""
    return eq_42(n) - _potential_43(n)


def eq_44_corrected(n):
    r"""|\dot{\vec{R_k}}|^2 in place of |\dot{\vec{R_n}}|^2, as in (42)."""
    return eq_42_corrected(n) - _potential_43(n)


def eq_45(kinetic, potential, n, q):
    r"""\frac{d}{dt}(\frac{\partial L}{\partial{\dot{\theta_q}}})-\frac{\partial L}{\partial{\theta_q}}
    =-\frac{\partial T}{\partial{\theta_q}}+\frac{\partial(U)}{\partial{\theta_q}}
    +\frac{d}{dt}(\frac{\partial T}{\partial{\dot{\theta_q}}})=0.
    Returns the middle side for the given T and U."""
    return -kinetic.diff(th[q]) + potential.diff(th[q]) + time_derivative(kinetic.diff(w[q]), n)


def eq_46_1(n, q):
    r"""\frac{\partial(U)}{\partial{\theta_q}}=g \sum_{i=q}^{n} m_il_q\sin(\theta_q)"""
    return g * _sum(m[i] * l[q] * sin(th[q]) for i in range(q, n + 1))


def _kinetic_46(n, pairs):
    r"""\sum_{k=1}^{n} \frac{1}{2}m_k\sum_{(i,j)} l_il_j\dot{\theta_i}\dot{\theta_j}\cos(\theta_i-\theta_j)
    with (i, j) running over pairs(k)."""
    return _sum(
        half * m[k] * _sum(l[i] * l[j] * w[i] * w[j] * cos(th[i] - th[j]) for i, j in pairs(k))
        for k in range(1, n + 1)
    )


def _all_pairs(k):
    return [(i, j) for i in range(1, k + 1) for j in range(1, k + 1)]


def _equal_pairs(k):
    return [(i, i) for i in range(1, k + 1)]


def _unequal_pairs(k):
    return [(i, j) for i, j in _all_pairs(k) if i != j]


def eq_46_2(n, q):
    r"""-\frac{\partial T}{\partial{\theta_q}} =-\frac{\partial}{\partial{\theta_q}}
    \Big(\sum_{k=1}^{n} \frac{1}{2}m_k\sum_{i,j=1}^{k} l_il_j\dot{\theta_i}\dot{\theta_j}
    cos(\theta_i-\theta_j) \Big)
    =\sum_{k=q}^{n} m_k\sum_{i=1}^{k} l_il_q\dot{\theta_i}\dot{\theta_q}\sin(\theta_q-\theta_i).
    Returns (the kinetic energy inside the derivative, the middle side, the last side)."""
    kinetic = _kinetic_46(n, _all_pairs)
    middle = -kinetic.diff(th[q])
    last = _sum(
        m[k] * _sum(l[i] * l[q] * w[i] * w[q] * sin(th[q] - th[i]) for i in range(1, k + 1))
        for k in range(q, n + 1)
    )
    return kinetic, middle, last


def eq_46_3(n, q):
    r"""\frac{d}{dt}\big(\frac{\partial }{\partial{\dot{\theta_q}}}\Big(\sum_{k=1}^{n}
    \frac{1}{2}m_k\sum_{i=j=1}^{k} l_il_j\dot{\theta_i}\dot{\theta_j}\cos(\theta_i-\theta_j)
    \Big)\big) = \sum_{k=q}^{n} m_k{l_q}^2\ddot{\theta_q}, printed under "When i=j".
    The lower limit i=j=1 is read as the sum over i = j from 1 to k.
    Returns (the kinetic part inside the derivative, the left side, the right side)."""
    kinetic = _kinetic_46(n, _equal_pairs)
    left = time_derivative(kinetic.diff(w[q]), n)
    right = _sum(m[k] * l[q] ** 2 * a[q] for k in range(q, n + 1))
    return kinetic, left, right


def _kinetic_46_4(n, reading):
    if reading == "as printed":
        return _kinetic_46(n, _all_pairs)
    if reading == "i != j":
        return _kinetic_46(n, _unequal_pairs)
    raise ValueError(reading)


def eq_46_4(n, q, reading):
    r"""\frac{d}{dt}\big(\frac{\partial }{\partial{\dot{\theta_q}}}\Big(\sum_{k=1}^{n}
    \frac{1}{2}m_k\sum_{i,j=1}^{k} l_il_j\dot{\theta_i}\dot{\theta_j}\cos(\theta_i-\theta_j)
    \Big)\big)
    = \sum_{k=q}^{n} m_k\sum_{i=1}^{k} l_il_q\dot{\theta_i}\dot{\theta_q}\sin(\theta_i-\theta_q)
    [\dot{\theta_q}-\dot{\theta_i}]
    + \sum_{k=q}^{n} m_k\sum_{i=1}^{k} l_il_q\cos(\theta_i-\theta_q)\ddot{\theta_i},
    printed under "When i \neq j".

    The inner sum is printed over all i, j = 1..k ("as printed"); the heading says the
    i = j terms are excluded ("i != j"). Returns (kinetic part, left side, right side)."""
    kinetic = _kinetic_46_4(n, reading)
    left = time_derivative(kinetic.diff(w[q]), n)
    right = _sum(
        m[k]
        * _sum(
            l[i] * l[q] * w[i] * w[q] * sin(th[i] - th[q]) * (w[q] - w[i]) for i in range(1, k + 1)
        )
        for k in range(q, n + 1)
    ) + _sum(
        m[k] * _sum(l[i] * l[q] * cos(th[i] - th[q]) * a[i] for i in range(1, k + 1))
        for k in range(q, n + 1)
    )
    return kinetic, left, right


def eq_46_4_corrected(n, q, reading):
    r"""The factor \dot{\theta_q} dropped from the first sum; for the reading "i != j"
    also \phi_{iq} inserted in the second sum, as the paper itself does in (46).
    Returns the right side."""
    weight = phi if reading == "i != j" else (lambda i, q_: 1)
    return _sum(
        m[k]
        * _sum(l[i] * l[q] * w[i] * sin(th[i] - th[q]) * (w[q] - w[i]) for i in range(1, k + 1))
        for k in range(q, n + 1)
    ) + _sum(
        m[k] * _sum(l[i] * l[q] * weight(i, q) * cos(th[i] - th[q]) * a[i] for i in range(1, k + 1))
        for k in range(q, n + 1)
    )


def eq_46_terms(n, q, corrected=False):
    r"""The five sums of (46), in printed order:
    g\sum_{i=q}^{n} m_il_q\sin(\theta_q)
    + \sum_{k=q}^{n} m_k\sum_{i=1}^{k} l_il_q\dot{\theta_i}\dot{\theta_q}\sin(\theta_q-\theta_i)
    +\sum_{k=q}^{n} m_k{l_q}^2\ddot{\theta_q}
    +\sum_{k=q}^{n} m_k\sum_{i=1}^{k} l_il_q\dot{\theta_i}\dot{\theta_q}sin(\theta_i-\theta_q)
    [\dot{\theta_q}-\dot{\theta_i}]
    + \sum_{k=q}^{n} m_k\sum_{i=1}^{k} l_il_q\phi_{iq}\cos(\theta_i-\theta_q)\ddot{\theta_i}=0

    corrected=True drops the factor \dot{\theta_q} of the fourth sum."""
    ks = range(q, n + 1)
    extra = 1 if corrected else w[q]
    return {
        "gravity": g * _sum(m[i] * l[q] * sin(th[q]) for i in range(q, n + 1)),
        "velocity": _sum(
            m[k] * _sum(l[i] * l[q] * w[i] * w[q] * sin(th[q] - th[i]) for i in range(1, k + 1))
            for k in ks
        ),
        "diagonal": _sum(m[k] * l[q] ** 2 * a[q] for k in ks),
        "bracket_sin": _sum(
            m[k]
            * _sum(
                l[i] * l[q] * w[i] * extra * sin(th[i] - th[q]) * (w[q] - w[i])
                for i in range(1, k + 1)
            )
            for k in ks
        ),
        "bracket_cos": _sum(
            m[k]
            * _sum(l[i] * l[q] * phi(i, q) * cos(th[i] - th[q]) * a[i] for i in range(1, k + 1))
            for k in ks
        ),
    }


def eq_46(n, q):
    r"""(46) as printed: see eq_46_terms. Returns the left-hand side."""
    return _sum(eq_46_terms(n, q).values())


def eq_46_corrected(n, q):
    r"""l_il_q\dot{\theta_i}\sin(\theta_i-\theta_q)[\dot{\theta_q}-\dot{\theta_i}] in place of
    l_il_q\dot{\theta_i}\dot{\theta_q}sin(\theta_i-\theta_q)[\dot{\theta_q}-\dot{\theta_i}]."""
    return _sum(eq_46_terms(n, q, corrected=True).values())


def _eq_47(n, q, extra_factor):
    return _sum(
        g * m[k] * l[q] * sin(th[q])
        + m[k] * _sum(l[i] * l[q] * w[i] * w[q] * sin(th[q] - th[i]) for i in range(1, k + 1))
        + m[k] * l[q] ** 2 * a[q]
        + m[k]
        * _sum(
            l[i] * l[q] * w[i] * extra_factor * sin(th[i] - th[q]) * (w[q] - w[i])
            for i in range(1, k + 1)
        )
        + m[k] * _sum(l[i] * l[q] * phi(i, q) * cos(th[i] - th[q]) * a[i] for i in range(1, k + 1))
        for k in range(q, n + 1)
    )


def eq_47(n, q):
    r"""\sum_{k=q}^{n} \Big( gm_kl_q\sin(\theta_q)
    + m_k\sum_{i=1}^{k} l_il_q\dot{\theta_i}\dot{\theta_q}\sin(\theta_q-\theta_i) + m_k{l_q}^2\ddot{\theta_q}
    + m_k\sum_{i=1}^{k} l_il_q\dot{\theta_i}\dot{\theta_q}\sin(\theta_i-\theta_q)[\dot{\theta_q}-\dot{\theta_i}]
    + m_k\sum_{i=1}^{k} l_il_q\phi_{iq}\cos(\theta_i-\theta_q)\ddot{\theta_i} \Big)=0.
    Returns the left-hand side."""
    return _eq_47(n, q, w[q])


def eq_47_corrected(n, q):
    r"""The factor \dot{\theta_q} dropped from the fourth term, as in (46)."""
    return _eq_47(n, q, 1)


# Section 6


def eq_86(j, n):
    r"""\sum_{k=1}^{n} \Big(gl_j\sin(\theta_j)m_k\sigma_{jk}+m_kl_j^2\ddot{\theta_j}\sigma_{jk}
    +(\sum_{q\geq k}^{n} m_q\sigma_{jq})l_jl_k\sin(\theta_j-\theta_k)\dot{\theta_j}\dot{\theta_k}
    + (\sum_{q\geq k}^{n} m_q\sigma_{jq})l_jl_k[\sin(\theta_k-\theta_j)[\dot{\theta_j}
    -\dot{\theta_k}]\dot{\theta_k}+\phi_{jk}\cos(\theta_j-\theta_k)\ddot{\theta_k}]\Big) =0.
    Transcribed apart from (38) on purpose. Returns the left-hand side."""
    total = sp.Integer(0)
    for k in range(1, n + 1):
        mass = _sum(m[q] * sigma(j, q) for q in range(k, n + 1))
        total += (
            g * l[j] * sin(th[j]) * m[k] * sigma(j, k)
            + m[k] * l[j] ** 2 * a[j] * sigma(j, k)
            + mass * l[j] * l[k] * sin(th[j] - th[k]) * w[j] * w[k]
            + mass
            * l[j]
            * l[k]
            * (sin(th[k] - th[j]) * (w[j] - w[k]) * w[k] + phi(j, k) * cos(th[j] - th[k]) * a[k])
        )
    return total


PRINTED = {
    **{str(k): globals()[f"eq_{k}"] for k in range(1, 48) if k != 46},
    "46": eq_46,
    "46.1": eq_46_1,
    "46.2": eq_46_2,
    "46.3": eq_46_3,
    "46.4": eq_46_4,
    "sigma": sigma,
    "phi": phi,
    "86": eq_86,
}

CORRECTED = {
    "14": eq_14_corrected,
    "15": eq_15_corrected,
    "17": eq_17_corrected,
    "18": eq_18_corrected,
    "26": eq_26_corrected,
    "39": eq_39_corrected,
    "41": eq_41_corrected,
    "42": eq_42_corrected,
    "44": eq_44_corrected,
    "46.4": eq_46_4_corrected,
    "46": eq_46_corrected,
    "47": eq_47_corrected,
}
