"""Generates the game's short sound effects (mono 16-bit WAV, 44.1 kHz). Run: python3 tools/audio/gen_sfx.py"""
import numpy as np, wave, os
SR = 44100
rng = np.random.default_rng(7)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'audio')
os.makedirs(out, exist_ok=True)

def t(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.005, r=0.1):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def lowpass(x, k):
    c = np.cumsum(np.insert(x, 0, 0)); y = (c[k:] - c[:-k]) / k
    return np.concatenate([np.full(k - 1, y[0]), y])
def noise(n): return rng.uniform(-1, 1, n)
def save(name, x, gain=0.85):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    with wave.open(os.path.join(out, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())

def hit(crit=False):
    d = 0.22 if not crit else 0.45; x = t(d); n = len(x)
    thump = np.sin(2 * np.pi * (140 * np.exp(-x * 18) + 45) * x) * np.exp(-x * 20)
    crack = lowpass(noise(n), 6) * np.exp(-x * 45)
    y = thump * 0.9 + crack * 0.8
    if crit: y += 0.35 * np.sin(2 * np.pi * 1320 * x) * np.exp(-x * 9) + 0.25 * np.sin(2 * np.pi * 1980 * x) * np.exp(-x * 11)
    return y

def swish(d, f0, f1, lp):
    x = t(d); n = len(x)
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(f0, f1, n)) / SR)
    y = lowpass(noise(n), lp) * 0.9 + sweep * 0.15
    return y * np.sin(np.linspace(0, np.pi, n)) ** 1.5

def magic():
    d = 0.6; x = t(d); y = np.zeros(len(x))
    for i, f in enumerate([523, 659, 784, 1047, 1319]):
        s = int(i * 0.055 * SR); seg = x[: len(x) - s]
        y[s:] += np.sin(2 * np.pi * f * seg) * np.exp(-seg * 7) * (0.8 + 0.2 * np.sin(2 * np.pi * 9 * seg))
    return y

def boss_phase():
    d = 1.1; x = t(d); n = len(x)
    drone = np.sin(2 * np.pi * 55 * x) + 0.5 * np.sin(2 * np.pi * 82.5 * x + 1.3)
    swell = lowpass(noise(n), 40) * np.sin(np.linspace(0, np.pi, n)) ** 2
    return (drone * np.exp(-x * 2.2) * 0.8 + swell * 0.9) * env(n, 0.02, 0.4)

def click():
    x = t(0.05); return np.sin(2 * np.pi * 1800 * x) * np.exp(-x * 90) + 0.3 * lowpass(noise(len(x)), 3) * np.exp(-x * 120)

def coin():
    x = t(0.3); y = np.sin(2 * np.pi * 1318 * x) * np.exp(-x * 10)
    s = int(0.07 * SR); y[s:] += np.sin(2 * np.pi * 1760 * x[: len(x) - s]) * np.exp(-x[: len(x) - s] * 9)
    return y

save('hit', hit()); save('impact-critical', hit(True)); save('sword', swish(0.2, 900, 2600, 5), 0.7)
save('dash', swish(0.28, 400, 1500, 12), 0.6); save('magic', magic(), 0.7); save('boss_phase', boss_phase(), 0.9)
save('ui_click', click(), 0.6); save('coin', coin(), 0.6)
print('ok')
