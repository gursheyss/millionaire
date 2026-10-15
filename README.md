# Millionaire (Chat Edition)

"Who Wants to Be a Millionaire" overlay and controller for a Twitch stream. Chat members get pulled into the Discord stage one at a time; a right answer sends them out and climbs the ladder, a wrong answer greys out their pick and they stay until they get it right. 20 questions to the top.

Two screens, one tiny Node server:

- `/show` – the 1920x1080 overlay the streamer adds to OBS as a Browser Source. Plain HTML/CSS/JS, display only, plays the show sound cues.
- `/control` – the controller's page, a React + Tailwind app in `control/` built on [beautiful-ui](https://github.com/slev12397/beautiful-ui) primitives (Button, ValuePill, EntityChip, GlideMenu, TaskRows, LoadingState). Seats contestants, drives the question flow, runs lifelines, edits questions and the prize ladder, and shows a live preview of the overlay. Light and dark.

Every control action goes through the server over a WebSocket, so OBS and the controller can be on different machines and a page refresh never loses the game.

## Run it locally

```
npm install
npm run build          # builds the control app into public/control
CONTROL_KEY=pick-a-password npm start
```

Then open http://localhost:3000/control and http://localhost:3000/show. To work on the control app with hot reload, run `npm run dev` inside `control/` and open the Vite URL; it proxies the API and overlay to port 3000.

## Deploy (Render, free tier)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gursheyss/millionaire)

Render reads `render.yaml`, generates a random `CONTROL_KEY`, and gives you a URL. Copy the key from the service's Environment tab and paste it into the control page when it asks (the show page never needs it). The free tier spins the service down after 15 minutes of inactivity; open the control page a minute before going live and it stays up for the whole stream. Game state lives in `data/state.json`, which survives restarts but not a redeploy. Railway and Fly work too via the included `Dockerfile`.

## OBS

Add a Browser Source pointing at `https://<your-host>/show`, 1920x1080. Tick "Control audio via OBS" if you want the show cues in the stream mix. Sound can be muted from the control page.

## Flow

1. **Seat contestant**: type their Discord name. The show puts up the name card ("Next contestant").
2. **Show question** (`Q`), then **Reveal next answer** (`R`) one at a time or **Reveal all** (`A`).
3. When they commit, click their answer (or `1`-`4`). It locks orange with the final-answer sting.
4. **Reveal result** (`Enter`). Correct turns green, wrong turns red and shows the right one.
5. **Next** (`N`): after a correct answer the contestant leaves and the ladder moves up; after a wrong one the same contestant gets the same question again with that option greyed out.
6. **Undo** (`Z`) steps back any action, up to 40 deep.

Lifelines reset for each contestant. 50:50 removes two wrong answers, Ask the Chat shows a bar chart from the votes you type in after running a Twitch poll, Phone a Friend puts a 30 second clock on screen once the friend is in the call, and Swap Question pulls the next spare (questions after row 20) in.

## Questions

The control page imports straight from a Google Sheet shared as "anyone with the link": one row per question, question text first, then the four answers (an `A)` / `B)` prefix is stripped, blank cells are skipped), optionally followed by the correct letter. Mark the correct answer with the radio buttons, then **Save questions**. Rows 1-20 are the ladder, anything after that is a spare.

## Credits

Control-screen components and design tokens are from [beautiful-ui](https://github.com/slev12397/beautiful-ui) (MIT). Sound cues and lifeline icons are from [mistermantas/millionaire-js](https://github.com/mistermantas/millionaire-js) (MIT). They are recordings of the show's actual cues, so whether they are safe to put on stream is your call; sound can be turned off from the control page.
