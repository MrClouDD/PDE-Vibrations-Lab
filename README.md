# Vibrations Lab

An interactive 3D visualizer for vibration problems from Zill, *Differential Equations with
Boundary-Value Problems* (9th ed.), built around Exercises 13.3 #11: radial vibrations of a sphere,
a²(u_rr + (2/r)u_r) = u_tt, u(c,t) = 0, u(r,0) = f(r), u_t(r,0) = g(r).

Open `index.html` through any static web server (it loads three.js, math.js and MathJax from public
CDNs). The page shows the problem as the book writes it, the series solution with its computed
coefficients, and the motion in 3D, which you can rotate and zoom.

- Shapes: string, rectangular membrane, drum, solid sphere, solid cylinder
- Book problems: 13.3 #11, 12.6 #9, #10, #15, #20, 12.7 #6, Ch. 12 Review #6 and #8, and more
- Your own f, g, boundary values and forcing; heat and Laplace equations as a bonus

Tests (Node 20+): `npm install --no-save mathjs@12.4.2` then `node --test "tests/*.test.mjs"`.
