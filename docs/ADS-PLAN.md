# Future advertising plan for Penicillion

Status: proposed after the DigitalOcean pilot. The owner intends to commercialize the game. The ad provider, placements and activation date are open decisions. The pilot can establish normal load times and completion rates before any advertising experiment. This document describes future work.

### 1. Choose the first placement and provider

Propose one clearly labeled slot below the completed Daily or Practice scorecard, separated from Share, Next and Play Again. Load it once after the result is visible. Keep live questions, timed entry, Relay, private groups and account screens free of placements during this trial. Reserve layout space on mobile so a late creative cannot move a button under a player's finger. Avoid automatic interstitials and page-wide automatic placement during the experiment. The owner reviews desktop and mobile mockups before integration.

Compare a fixed contextual sponsorship with an ad network such as Google AdSense. A sponsor can supply a locally served creative with an agreed fee and end date. A network requires publisher onboarding, site review, consent handling and measurement. For AdSense, the owner controls the publisher and payment accounts, verifies the domain and submits the site for review when accessible. Use the provider-issued publisher entry for a root ads.txt file if requested. Record the actual review result and permitted formats. [AdSense site review](https://support.google.com/adsense/answer/81904?hl=en) · [Placement policies](https://support.google.com/adsense/answer/1346295?hl=en) · [Ads.txt guide](https://support.google.com/adsense/answer/7532444?hl=en)

### 2. Review rights and privacy

Review commercial use of the shipped question sources, original art, bundled fonts and any sponsor creatives. Keep required attribution and the NLM non-endorsement notice. Record the release and any source or asset that needs replacement. [Content rights manifest](../content/LICENSES.md) · [Font licenses](../web/design/TYPE.md)

Prefer contextual inventory. Exclude typed medical answers, question-level behavior, inferred health interests, account identifiers, room codes, invitation links and session data from ad targeting and vendor events. Use aggregate placement counts. Review which countries and age groups the pilot serves, publish accurate privacy and cookie disclosures, and configure consent and withdrawal for the chosen vendor and regions. Google specifies a certified consent platform for personalized ads in the EEA, UK and Switzerland. Recheck requirements before launch, including cookie use for non-personalized ads. [Google publisher policies](https://support.google.com/adsense/answer/10502938?hl=en) · [Google consent rules](https://support.google.com/adsense/answer/13554116?hl=en) · [Non-personalized advertising](https://support.google.com/adsense/answer/9007336?hl=en)

### 3. Implement and verify only when requested

Begin with an inert placeholder and a default-off switch. The game is a single-page app with a restrictive Content Security Policy. A third-party script loaded into its main document can retain access as the user navigates to another screen. Design a provider-supported isolated placement or a separate results document that exposes only public context. If the provider requires access that conflicts with the privacy design, use a directly served sponsor placement or defer activation. Restrict allowed origins specifically and preserve the game's existing security headers. Keep payment and account-management credentials server-side.

Test in staging with placeholders or provider-supported test inventory. Keep automated tests, load generators and operator clicks off live inventory. Inspect outgoing requests and referrers with test answers and private room codes. Exercise consent granted, declined and withdrawn, slow or blocked ads, no fill, repeated visits, keyboard controls and narrow screens. Confirm the score saves once, the results remain readable, and the slot disappears on route changes. The operator must be able to disable the integration promptly if a creative disrupts play or leaks data.

### 4. Evaluate a limited release

After owner approval, enable one placement for a small cohort and record eligible scorecards, impressions served, net revenue per thousand impressions, completion and replay rates, layout shifts, latency and complaints. Define acceptable thresholds against the ad-free pilot before running the trial. After a month, compare net revenue with actual hosting and backup costs. Break-even impressions equal monthly cost divided by net revenue per thousand impressions, multiplied by 1,000. Fifteen concurrent players alone cannot predict that number. Review the results with the owner before adding any placement. Disable ads while investigating a privacy breach, accidental-click pattern or gameplay regression.
