/**
 * The prompt library: briefs that already say what a good result needs (layout, content, palette,
 * interactions, states and the phone layout), so nobody has to find that out by trial and error.
 */
export const PRESETS: { title: string; prompt: string }[] = [
  {
    title: 'Coffee roastery dashboard',
    prompt:
      'A dashboard for Ember & Oak, a specialty coffee roastery. A slim sidebar (Overview, Orders, Roasts, Wholesale, Settings) that becomes a top bar on a phone. Four KPI cards: Revenue this week, Orders, Average order value and Repeat customers, each with a change badge and a small SVG sparkline. A weekly revenue bar chart (Mon to Sun) drawn in SVG, with the value shown on hover. A best-sellers table with coffee name, origin, a roast-level pill, bags sold and a stock bar. A light / dark switch in the header that re-themes everything: cream and espresso in light mode, roasted brown with amber accents in dark mode.',
  },
  {
    title: 'SaaS landing hero',
    prompt:
      'A landing page hero for Relay, an AI meeting-notes app. Near-black background with one soft violet glow behind the headline. A top nav with the logo, four links, a ghost "Sign in" and a solid "Start free" button; under 768px the links fold into a menu button that opens a panel. The hero has a small pill badge ("New: live summaries"), a two-line headline around 64px with tight tracking, a one-sentence subhead, two buttons, and a row of five customer wordmarks drawn as simple SVG. Beside it (below it on a phone) a product card: a meeting with a waveform, speaker chips and three action items that tick off when clicked.',
  },
  {
    title: 'Pricing with toggle',
    prompt:
      'A pricing section with three plans: Starter (free), Pro ($24) and Team ($59 per seat). A Monthly / Yearly segmented switch that slides and applies 20% off yearly prices, with a "Save 20%" tag. The middle plan is raised with an accent border and a "Most popular" ribbon. Each card has the plan name, a one-line pitch, a large price with "/month", a button and six feature rows with check or dash icons. Below the cards, a "Compare all features" table that expands and collapses, and an FAQ accordion with four questions. Light theme: off-white background, near-black text and a single indigo accent. Cards stack on a phone.',
  },
  {
    title: 'Two-step sign-up',
    prompt:
      'A two-step sign-up card for Loom & Line, a design tool. Step 1: name, work email and a password with a show / hide button, a four-segment strength meter and a rules checklist that ticks as each rule is met. Step 2: a role picker as selectable cards and a team-size slider. Validate each field when it loses focus, with friendly messages; the Continue button stays disabled until the step is valid. Show "Step 1 of 2" with a progress bar, a Back button on step 2, and a success screen with an animated check at the end. Google and GitHub buttons with SVG logos. Centred on a faint grid background, light theme with a violet accent, fully usable with the keyboard.',
  },
  {
    title: 'Music player',
    prompt:
      'A now-playing music player card. Album art made from a gradient and SVG shapes, the track title and artist, and a progress bar you can drag, with elapsed and remaining time that advance every second while playing. Shuffle, previous, play / pause, next and repeat buttons with clear active states, plus a volume slider. A five-bar equaliser animation that moves only while playing. Below it, an "Up next" queue of five tracks; clicking one makes it the current track. A glassy dark card on a deep purple-to-black backdrop, with the art filling the width on a phone.',
  },
  {
    title: 'Kanban board',
    prompt:
      'A kanban board for a product team with four columns: Backlog, In progress, Review and Done, each with a card count. Cards show a title, coloured label chips (Bug, Feature, Design), an assignee avatar with initials and a due date that turns red when overdue. Cards can be dragged between columns with native HTML5 drag and drop, with a highlighted drop zone. Each column has an "Add card" form at the bottom, and a search box above the board filters cards as you type. Clean light interface: soft grey columns and white cards with subtle shadows. On a phone the columns scroll sideways.',
  },
  {
    title: 'Account settings',
    prompt:
      'An account settings page with tabs down the left (Profile, Notifications, Security, Billing) that become a dropdown on a phone. Profile: an avatar with initials and a Change button, name, a username with an "@" prefix, and a bio with a 160-character counter. Notifications: grouped toggle switches with a short description each. Security: a two-factor card with a status badge, and a list of signed-in devices with a "Sign out" button each. Billing: the current plan and a usage meter. When anything changes, a bar slides up from the bottom with Discard and Save; Save shows a spinner and then a toast. Neutral light theme with a blue accent.',
  },
  {
    title: 'Weather card',
    prompt:
      'A weather card for Cape Town. The current temperature in large type, the condition with an animated SVG icon (slowly turning sun rays, drifting clouds), and small tiles for feels-like, wind, humidity and UV. An hourly strip of 12 hours that scrolls sideways, and a 7-day forecast with a bar showing each day\'s low-to-high range. A °C / °F switch converts every value. Buttons for Clear, Cloudy and Night change the condition, and the background gradient follows it: blue sky, grey-blue, or deep indigo. Rounded and soft, like a phone weather app.',
  },
];
