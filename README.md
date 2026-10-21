# Millionaire (Chat Edition)

"Who Wants to Be a Millionaire" overlay and controller for a Twitch stream. Chat members get pulled into the Discord stage one at a time; a right answer sends them out and climbs the ladder, a wrong answer greys out their pick and they stay until they get it right. 20 questions to the top.

Two screens, one [Void](https://void.cloud) app on Cloudflare:

- `/show` – the 1920x1080 overlay the streamer adds to OBS as a Browser Source. Plain HTML/CSS/JS in `public/`, display only, plays the show sound cues.
- `/control` – the controller's page, a React + Tailwind app (`control.html`, `src/`) built on [beautiful-ui](https://github.com/slev12397/beautiful-ui) primitives (Button, ValuePill, EntityChip, GlideMenu, TaskRows, LoadingState). Seats contestants, drives the question flow, runs lifelines, edits questions and the prize ladder, and shows a live preview of the overlay. Light and dark.

Both pages talk to one WebSocket room (`routes/game.ws.ts`, a Durable Object) that owns the game state, so OBS and the controller can be on different machines, every open screen sees the same thing, and a page refresh or redeploy never loses the game. The pure game rules live in `src/game.ts`.

## Run it locally

```
npm install
echo CONTROL_KEY=pick-a-password > .env
npm run dev
```

Then open http://localhost:3000/control and http://localhost:3000/show. Paste the key into the control page when it asks (the show page never needs it). `npm test` runs the game-rule tests, `npm run typecheck` type-checks everything including the routes.

## Deploy

```
npx void cloudflare login
npx void deploy --platform cloudflare
```

The first run provisions the Worker and the Durable Object that holds game state in your Cloudflare account (`void.config.ts` and `void.lock.json` pin the resource names, keep them committed). Set the control key as a secret before going live; it reads the value from stdin or prompts for it:

```
npx void secret put CONTROL_KEY
```

The app is live at https://millionaire.rkwarya.workers.dev.

## OBS

Add a Browser Source pointing at `https://<your-host>/show`, 1920x1080. Tick "Control audio via OBS" if you want the show cues in the stream mix. Sound can be muted from the control page.

## Flow

1. **Seat contestant**: type their Discord name. The show puts up the name card ("Next contestant").
2. **Show question** (`Q`), then **Reveal one** (`R`) at a time or **Reveal all answers** (`A`).
3. When they commit, click their answer (or `1`-`4`). It locks orange with the final-answer sting.
4. **Reveal result** (`Enter`). Correct turns green, wrong turns red and shows the right one.
5. **Next** (`N`): after a correct answer the contestant leaves and the ladder moves up; after a wrong one the same contestant gets the same question again with that option greyed out.
6. **Undo** (`Z`) steps back any action, up to 40 deep.

Lifelines reset for each contestant. 50:50 removes two wrong answers, Ask the Chat shows a bar chart from the votes you type in after running a Twitch poll, Phone a Friend puts a 30 second clock on screen once the friend is in the call, and Swap Question pulls the next spare (questions after row 20) in.

## Questions

The control page imports straight from a Google Sheet shared as "anyone with the link": one row per question, question text first, then the four answers (an `A)` / `B)` prefix is stripped, blank cells are skipped), optionally followed by the correct letter. Mark the correct answer with the radio buttons, then **Save questions**. Rows 1-20 are the ladder, anything after that is a spare.

## Credits

Control-screen components and design tokens are from [beautiful-ui](https://github.com/slev12397/beautiful-ui) (MIT). Sound cues and lifeline icons are from [mistermantas/millionaire-js](https://github.com/mistermantas/millionaire-js) (MIT). They are recordings of the show's actual cues, so whether they are safe to put on stream is your call; sound can be turned off from the control page.
