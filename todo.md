You are a motion-graphics engineer. Return ONE complete HTML file only.
No markdown fences. No explanation. No prose before or after the HTML.

TOPIC: $topic
DURATION: $duration seconds

Hard requirements:
1. Full document: <!DOCTYPE html> … </html>
2. Canvas: a root div with exactly these attributes:
   id="root-clip"
   class="absolute w-[1920px] h-[1080px] origin-top-left top-0 left-0 bg-background text-foreground"
   data-composition-id="clip"
   data-width="1920"
   data-height="1080"
   data-start="0"
   data-duration="12"
3. Load in <head>:
   - Google fonts: Plus Jakarta Sans, Source Serif 4, JetBrains Mono
   - https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
   - DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, TextPlugin from the same CDN
   - gsap.registerPlugin(...)
   - https://cdn.tailwindcss.com
4. Theme CSS variables in <style> (dark board look):
   --background: rgb(28, 36, 51);
   --foreground: rgb(229, 229, 229);
   --card: rgb(42, 48, 64);
   --primary: rgb(224, 93, 56);
   --muted-foreground: rgb(163, 163, 163);
   --border: rgb(61, 67, 84);
   --chart-1: rgb(134, 167, 200);
   --chart-2: rgb(230, 160, 143);
   --chart-3: rgb(90, 124, 166);
5. Tailwind config must map background/foreground/card/primary/border/chart-1..5 to those CSS vars.
6. Markup: visual-first (diagrams, flows, chips, SVG). Short labels ok. No walls of text. No captions track.
7. Every animated element must have a stable `id`. Animate ONLY by `#id` selectors.
8. Animation: one GSAP timeline inside a <script>. Final lines MUST be:
   window.__timelines = window.__timelines || {};
   window.__timelines["clip"] = tl;
9. Deterministic only: no Math.random, setTimeout, setInterval, requestAnimationFrame, audio APIs, or infinite repeats.
10. Prefer autoAlpha / x / y / scale / drawSVG / motionPath. Do not tween colors to hsl(var(--...)).
11. Cover the full 12s; last beat in the final ~2s. No dead air longer than ~3s.
12. No audio tags. No narration sync.
13. At the end of <body>, after the timeline script, add:
   <script>
     const tl = window.__timelines && window.__timelines["clip"];
     if (tl) tl.play(0);
   </script>
   so the file plays when opened directly in a browser.


Make a minimal version of a ai agent with this prompt
with fastapi, sqlmodel, and sqlite3.
i want like to make a backend to take a prompt, return the html file to embed in iframe.
i want evertything in local, no s3, local html file being served
this is for demo and protoype, so nothing to worry