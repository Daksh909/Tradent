# Agentic Trading Platform: MVP Spec

Oct 20, 2026 · Daksh · exported from the living spec: https://claude.ai/code/artifact/1e593057-303e-4559-aefd-bed0a81139be

## How to read this spec

This is the MVP spec handed to Claude Code. Every product decision is closed and listed in the Decision log at the end, which wins over anything else in this file. Items marked **Default** are gap-fillers chosen during spec writing; build them as written and keep them easy to change.

Every claim carries one of three labels:

- **Verified**: checked against a source linked beside it. Broker pages were checked through search results and one directory opened directly ([awesome-broker-mcp](https://github.com/mphinance/awesome-broker-mcp), last verified 2026-10-09). Each still needs a click-through on the broker's own developer docs before we code against it.
- **Inferred**: my reasoning from verified facts, not a fact itself.
- **Decision**: a product choice only Daksh can make. Each has a recommendation, and none is defaulted silently.

This is research, not legal advice. The regulatory section names where counsel is needed.

## Broker landscape

Equities and options are well covered by brokers that allow agent trading; futures are covered by few; US retail forex has no broker with an official agent route. Only Interactive Brokers covers all four, and its official AI route drafts orders without submitting them.

Two different routes matter, and they are easy to confuse:

1. **Broker MCP server**: a customer plugs their own AI assistant into their own account. This is what most 2026 "agentic trading" launches are.
2. **Third-party platform API (OAuth or partner)**: our platform places trades in many customers' accounts. This is the route our product needs, and it usually requires broker approval.

| Broker | Official agent route | Equities | Options | Futures | Forex (US) | Paper mode | Route for our platform |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Alpaca](https://alpaca.markets/agentic) | Official MCP, trades | Yes | Yes, multi-leg | Not yet; FCM registered Aug 2026, futures "subject to regulatory approval" ([press](https://secure.businesswire.com/news/home/20260806991651/en/Alpaca-Registers-as-Futures-Commission-Merchant-with-the-CFTC-and-NFA-to-Advance-Launch-of-Prediction-Markets)) | Roadmap only ([docs](https://docs.alpaca.markets/docs/about-alpaca)) | Yes, default | [Connect API (OAuth)](https://docs.alpaca.markets/docs/about-connect-api); live trading for other users and commercial apps need Alpaca approval |
| [Interactive Brokers](https://www.interactivebrokers.com/en/index.php?f=78687) | Official MCP, drafts only; you submit in IBKR | Yes | Yes | Yes | Yes | Yes (IBKR paper accounts) | [Third-party OAuth 1.0a](https://www.interactivebrokers.com/docs/web-api/authentication/oauth-1a/third-party-oauth/third-party-o-auth-workflow); compliance approval required first |
| [Robinhood](https://robinhood.com/us/en/newsroom/robinhood-is-now-open-to-agents/) | Official MCP (May 27, 2026), separate agent account | Yes | Yes | Discussed, not live | No | Not stated | Not found: built for a customer's own agent |
| [Webull](https://www.webull.com/news/15344695056475136) | Official MCP; cloud queues orders for in-app confirm | Yes | Yes | Yes | No | Sandbox by default | [Connect API (OAuth 2.0)](https://developer.webull.com/apis/docs/connect-api/about-connect-api), lists futures |
| [tastytrade](https://developer.tastytrade.com/docs/sdks-and-tools/mcp-server/) | Official MCP, self-hosted, dry-run first | Yes | Yes | Yes, incl. futures options | No | Opt-in sandbox | Partner integrations exist (e.g. TradersPost); terms not yet checked |
| [TradeStation](https://institutional.tradestation.com/technology/institutional-ai-trading/) | Official MCP | Yes | Not confirmed | Not confirmed | No | Not stated | Not yet checked; one review cites $10k minimum + paid AI tier |
| Tradier | Official MCP | Yes | Yes, multi-leg | No | No | Not stated | Not yet checked |
| Public.com | Official MCP | Yes | Yes | No | No | None, all live | Not yet checked |
| [Tradovate](https://community.tradovate.com/t/third-party-oauth-integration/12456) | Community MCP only | No | No | Yes | No | Not stated | Third-party OAuth per forum ($25/mo API, via support); CME data agreement needed |
| OANDA | Community MCP, read-only | No | No | No | Yes | Practice accounts | v20 REST API; third-party terms not yet checked |
| Schwab | Community MCP only | Yes | Yes | Not checked | Not checked | Opt-in (community) | Not yet checked |

Rows without a link come from the [awesome-broker-mcp directory](https://github.com/mphinance/awesome-broker-mcp). Fidelity, Merrill, Ally, SoFi, Vanguard and FOREX.com have no MCP route.

**Inferred:** an MVP that covers all four instruments on day one depends on a single broker (IBKR) approving us. An MVP on equities and options can launch on Alpaca paper accounts with no approval, and needs Alpaca's approval only for live trading.

## Regulatory constraints

The part of the idea that triggers registration is giving everyday investors strategies that trade their accounts automatically. Building tools for developers, and forward-testing on paper, carry far less regulatory weight.

| Activity | Regime | What it means for us | Status |
| --- | --- | --- | --- |
| Auto-trading securities strategies (equities, options) in subscribers' accounts | SEC, Investment Advisers Act | A practitioner guide says API auto-trading in a user's account "would likely require IA registration"; the publisher exclusion covers impersonal, non-personalized content only ([terms.law](https://terms.law/Trading-Legal/guides/investment-adviser-registration.html)). Composer, the closest competitor, is both an SEC-registered adviser and a broker-dealer ([source](https://neuronfeed.com/startups/composer)). | Verified secondary source; needs counsel |
| Selling or running automated futures or forex systems for others | CFTC / NFA, Commodity Trading Advisor | Advising others for pay on futures or retail forex makes you a CTA ([NFA](https://www.nfa.futures.org/registration-membership/who-has-to-register/cta.html)). In 2019 the CFTC fined two sellers of automated trading software $75,000 for acting as unregistered CTAs ([CFTC 8071-19](https://www.cftc.gov/PressRoom/PressReleases/8071-19)). Narrow exemptions exist under CFTC Reg 4.14. | Verified; needs counsel |
| A firm deploying AI agents that act on accounts | FINRA guidance | FINRA's 2026 Oversight Report flags agents acting "without human validation or approval" and asks for agent-specific controls ([Mayer Brown copy](https://www.mayerbrown.com/-/media/files/perspectives-events/publications/2025/12/finra-2026-regulatory-oversight-report.pdf%3Frev=-1)). It binds broker-dealers; it signals what brokers will ask of us. | Verified |
| Rules specific to agentic trading | SEC | None yet. House Democrats asked the SEC Chair in June 2026 what oversight exists ([Rep. Foster](https://foster.house.gov/media/press-releases/foster-sherman-seek-regulatory-clarity-agentic-ai-trading)). | Verified; moving target |

**Inferred:** three designs lower the registration burden, each with a trade-off for Daksh to decide on.

1. Developer tools plus paper forward-testing only: lowest burden, but no live trading for everyday investors.
2. The investor picks and approves every trade, so the platform never exercises discretion: helps, but auto-execution is the line regulators watch.
3. Partner with a registered adviser or broker-dealer, or register: required for true auto-trading of retail accounts.

Futures and forex add a second regulator (CFTC/NFA) on top of the SEC, which is a reason to phase them after equities and options.

## Competitive landscape

Each part of the idea exists somewhere; none of the players found combine an AI agent builder, a reusable library of tested agents, and forward-test records an investor can trust.

| Player | What it does | Who it serves | Trust gap we could fill |
| --- | --- | --- | --- |
| [Collective2](https://at.trustpilot.com/review/collective2.com) | Strategy marketplace; copies trades into subscribers' accounts; tracks go-forward results | Strategy sellers and followers; $20 to $200/month ([NexusFi](https://nexusfi.com/d/education/collective2)) | Its own site calls all results hypothetical; TrustScore 2/5 from 31 reviews |
| [Composer](https://neuronfeed.com/startups/composer) | No-code rule-based strategies, executed in-app; options added Dec 2025 | Retail investors; Pro around $29/month | Rules, not AI agents; stocks, ETFs and options only |
| [QuantConnect](https://www.quantconnect.com/docs/v1/live-trading/overview) | Code-first backtest and live trading (Python, C#); strategy licensing via Alpha Streams | Quant developers | Not built for everyday investors |
| [Surmount](https://www.cbinsights.com/company/surmount-ai/alternatives-competitors) | Automated investing with AI recommendations; around $20/month | Retail investors | No public API as of Dec 2025 ([listing](https://www.rankmyai.com/tools/aeb98b6d-9f7e-4a4d-ab00-5d50c38fc20e/surmount-ai)) |
| Broker agent launches (Robinhood, Webull, tastytrade) | Let a customer's own AI trade their account | Customers who already use an AI assistant | They supply the pipe, not the strategy or proof it works; Robinhood says it does not supervise or audit agents |

**Inferred:** the defensible wedge is the trust record (immutable forward-test history, agent lineage, versioning, guardrails), not the agent builder, which brokers and AI labs are commoditizing.

## Draft MVP shape

This is a draft for Daksh to change, not a decision: two kinds of user meet in one library, and an agent reaches investors only after it has a forward-test record.

> **Diagram (described in text): draft architecture, 9 parts, 2 kinds of user.**
> Developers use the **AI agent builder** (Studio). It writes agent versions to the **Agent registry** (versions, lineage, strategies). A version gets a **Smoke test** (developer-only) and then a **Forward-test engine** run: a **Scheduler** wakes the **Agent runner**, which calls Claude, passes proposed orders through **Guardrails**, and sends approved ones to the **Broker adapter** (Alpaca Broker API sandbox). Every decision and fill is appended to the **Trust record** (DecisionLog, fills, daily metrics). **TradingView webhooks** feed signals into the runner. Investors use the **Library**, which reads the registry and trust record, and **Paper-follow**, which mirrors a followed agent's fills into the investor's virtual portfolio.

The core loop, in order:

1. A developer describes or codes a strategy; the AI builder turns a plain-language manual strategy into an agent spec.
2. The agent is saved to the registry as a version, with its parent agents if it was forked or combined.
3. It gets a short smoke test on recent data (developer only), then forward-tests on its own paper account on a schedule.
4. Every forward-test trade and metric is written to an append-only trust record for that version.
5. Investors compare agents in the library by that record, and follow one (paper first; live depends on the regulatory decision).

**Inferred:** the registry and trust record are the product; the builder, engines and adapters are replaceable parts. Data comes from Alpaca, models and stack are in the Decision log, and hosting is not yet chosen.

## Build spec for Claude Code

This section turns the Decision log into what Claude Code builds; anything not listed here is out of scope for the MVP. Stack: TypeScript throughout, with a Next.js web app, Node workers for the scheduler and agent runner, Postgres, and Anthropic's TypeScript SDK. Backtesting is a smoke test only: a short run on recent data that the developer sees, never part of the trust record or the library. Design choices I made to fill gaps are marked **Default**, and each can be changed.

### Data model

| Entity | Key fields | Rules |
| --- | --- | --- |
| User | id, email, roles (developer, investor or both) | One account can hold both roles |
| Agent | id, owner, name, public summary, status (draft, forward-testing, listed, retired) | Listed only after 30 trading days and 20 trades |
| AgentVersion | agent id, version number, parent version ids, instructions (private), tools, data sources, risk limits, model (Haiku, Sonnet or Opus 5.5), cadence | Immutable once forward testing starts; any edit creates a new version |
| PaperAccount | agent version id, broker (Alpaca sandbox), external account id, starting cash | One per agent version; **Default** starting cash $100,000 |
| DecisionLog | agent version id, time, inputs snapshot, prompt hash, model id, output, tool calls, proposed orders, guardrail result, tokens, cost | Append-only; **Default** each entry stores the hash of the previous one so any edit is detectable |
| Order and Fill | decision id, symbol, side, quantity, type, broker status, fill price and time | Fills come only from the broker, never typed by us |
| DailyMetrics | agent version id, date, equity, return, max drawdown, trade count | Computed after market close |
| Follow | investor id, agent version id, virtual amount | Paper-follow mirrors the agent's fills scaled to the virtual amount; no investor brokerage account |
| SpendLedger | developer id, month, dollars spent | Agents pause when a developer reaches $10 in the month |
| SignalSource | agent id, TradingView webhook secret | Incoming alerts are inputs to the agent's next decision, never orders |
| Strategy | id, owner, name, public description, type (entry rule, exit rule, signal, TradingView alert, tool setup), parameters, version | A reusable building block; agent versions reference the strategy versions they combine, so the library can list every agent using a strategy |

### One agent decision, end to end

1. The scheduler wakes an agent version at its cadence, during US market hours only, if its developer is under the $10 cap.
2. The runner calls the chosen Claude model with the version's instructions and read-only tools: quotes, bars, option chains, positions, recent fills and any TradingView alerts.
3. The model returns proposed orders through a strictly typed order tool, or no action.
4. Guardrails check each order against the version's risk limits and reject what breaks them.
5. Approved orders go to the broker adapter, and fills are read back from the broker.
6. The full decision, guardrail result and cost are written to the DecisionLog before anything else happens.

### Guardrails (applied outside the model)

- Allowed symbols and instruments per version: equities and listed options only.
- **Default** limits a developer can tighten but not remove: max 20% of equity per position, max 5% daily loss, then the agent stops for the day.
- A kill switch per agent for its developer and for platform admins.
- No live trading code path exists in the MVP.

### Broker adapter interface

One interface with: get account, get positions, submit order, cancel order, get orders and fills, get quotes and bars, get option chain. The MVP ships one implementation for the Alpaca Broker API sandbox; IBKR, Robinhood, Schwab and Tradovate become later implementations.

### Screens

| Who | Screen | What it does |
| --- | --- | --- |
| Developer | Agent builder | Describe a manual strategy in plain words; Claude drafts the instructions, tools and risk limits for the developer to edit |
| Developer | Agent page | Versions, lineage, forward-test status, decision log with each decision's reasoning and cost, kill switch |
| Developer | Fork and combine | Start a new agent from one or more listed versions' public summaries and limits (prompts stay private) |
| Developer | Spend | AI spend this month against the $10 cap |
| Investor | Library | Listed agents with record length, return, max drawdown, trade count, young-record label |
| Investor | Agent detail | Summary, tools, risk limits, equity curve, every trade and decision time |
| Investor | My follows | Paper portfolios mirroring followed agents |

### Out of scope for the MVP

Live trading, futures, forex, non-US users, billing, agent memory, fine-tuned models, broker adapters other than Alpaca, and real-time all-exchange or OPRA options quotes (the MVP shows real-time IEX and 15-minute-delayed all-exchange data).

### Done means

- [ ] A developer can describe a strategy, get an agent version and start a forward test on its own Alpaca sandbox account.
- [ ] Every decision appears in the DecisionLog with inputs, model, output, guardrail result and cost.
- [ ] An agent listed after 30 trading days and 20 trades shows in the library with its record.
- [ ] An investor can paper-follow an agent and see a mirrored portfolio.
- [ ] A developer's agents pause at $10 of AI spend in a month.
- [ ] Guardrails reject an order over a risk limit, and the rejection is logged.

## UI/UX design

The app is built on [shadcn/ui](https://ui.shadcn.com) components with three open-source libraries for the hard parts: price charts, the visual agent composer and data tables. A strategy is a reusable building block that agents combine, and the Trading page shows free real-time IEX data plus 15-minute-delayed all-exchange data, each labeled with its source (both decided 2026-10-20).

### Design base

| Need | Open-source base | License | Why it fits |
| --- | --- | --- | --- |
| Components, layout, dark mode | [shadcn/ui](https://ui.shadcn.com) official dashboard blocks | MIT | Built for Next.js and Tailwind; code is copied into the repo, so Claude Code can change anything |
| App shell reference | [shadcn-admin](https://github.com/satnaing/shadcn-admin) (15.8k stars) | MIT | Sidebar, command palette, dark mode and tables to copy patterns from; it runs on Vite and TanStack Router, so we port its layout, not its routing |
| Price and equity charts | [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) | Apache 2.0 | Candlesticks with trade markers; requires naming TradingView and a link to tradingview.com, which its `attributionLogo` option covers |
| Agent composer canvas | [React Flow (xyflow)](https://github.com/xyflow/xyflow) | MIT | Drag-and-connect nodes for combining strategies, tools and agents; Pro is optional support, not needed |
| Metric charts and tables | shadcn/ui charts (Recharts) and data table (TanStack Table) | MIT (from my knowledge, confirm in each repo) | Same look as the rest of the app |

### Look and trust cues (Default)

- Dark theme first with a light mode toggle, the convention on trading screens.
- Gains in green with a plus sign and losses in red with a minus sign, so color is never the only signal.
- Tabular figures for every number so columns line up.
- A "Paper" badge in the top bar on every page, and a "Young record" badge on agents under 90 trading days.
- Every trade, metric and chart point links back to the decision that produced it.

### Navigation

A left sidebar with six pages, and a top bar with search (command palette, Cmd+K), market open or closed status, the Paper badge and the user menu.

| Page | Who | What's on it |
| --- | --- | --- |
| Library | Everyone | Tabs for Agents and Strategies; cards or table with record length, return, max drawdown, trade count, model, cadence and badges; filters by instrument, model and cadence |
| Agent detail | Everyone | Summary, strategies and tools used, risk limits, equity curve, trades, lineage graph of parent agents, Follow and Fork buttons |
| Studio | Developers | Chat builder that turns a described manual strategy into a draft agent, composer canvas, version history, smoke test |
| Forward tests | Developers | Every running test with progress toward 30 trading days and 20 trades, equity, drawdown, AI spend and status; drill into one test's daily metrics |
| Trading | Everyone | Live chart with the agent's trades marked, watchlist, quotes, option chain, positions, orders, fills and a live feed of each decision's reasoning |
| Portfolio | Investors | Paper portfolios mirroring followed agents, combined equity and per-agent breakdown |
| Spend and settings | Developers | AI spend against the $10 cap, API keys for TradingView webhooks, profile |

### Studio: building, forking and combining

The Studio has three panes. The left pane is a chat where the developer describes a manual strategy and Claude drafts the agent. The center is the composer canvas, where each node is a building block and wires show what feeds the AI model. The right pane shows the selected node's settings, and a bottom panel runs the smoke test.

- **Node types:** data source (quotes, bars, option chain), strategy block, TradingView alert, tool, AI model (Haiku, Sonnet or Opus 5.5 plus cadence), risk limits, and a broker output.
- **Fork:** opens an agent's public parts (summary, blocks, tools, limits) on the canvas as a new draft; prompts stay private to the original developer.
- **Combine:** drag strategy blocks or tools from two or more agents onto one canvas; the new agent records every parent in its lineage.
- **Start forward test:** locks the version, creates its paper account and moves it to Forward tests.

> **Wireframe (described in text): Studio.**
> Three panes plus a bottom panel. Left: chat ("Buy SPY when RSI(14) < 30 and price is above the 200-day average; exit at +3% or after 5 days") with Claude's reply drafting the agent. Center: React Flow canvas with nodes `Bars: SPY 1h`, `Strategy: RSI oversold`, `Strategy: Trend filter (200d MA)`, `TradingView alert` wired into `AI model: Sonnet 5.5 · hourly`, then `Risk limits: 20% position, 5% daily loss`, then `Broker: Alpaca paper`. Right: settings for the selected node plus an estimated AI cost of about $3.80 a month. Bottom: smoke test panel with Run button and recent-data results (developer only). Top actions: Save version, Start forward test.

Sample content: the developer's described strategy becomes three blocks wired into the model, then risk limits and the paper broker. The $3.80 estimate is the hourly Sonnet figure from Limits and costs.

### Trading: executions and paper trading

The Trading page is where agents' paper executions are watched as they happen. Its center is a candlestick chart with each agent order marked at its fill price and time; clicking a marker opens that decision's reasoning.

- **Left:** watchlist with last price, change and a data-source label (IEX real time or delayed).
- **Center:** chart with 1m to 1D intervals, volume, and the option chain on a tab beside it.
- **Right:** live decision feed, each entry showing the model's reasoning summary, the orders proposed and the guardrail result.
- **Bottom tabs:** positions, open orders, fills and account (cash, equity, buying power).
- **Agent switcher:** the page shows one agent's paper account at a time; investors see their mirrored portfolio through the same layout.

> **Wireframe (described in text): Trading.**
> Top bar shows agent switcher, market status and the Paper badge. Left: watchlist rows (symbol, last price, change, source label "IEX real-time" or "SIP 15-min delayed"). Center: Lightweight Charts candlestick chart with interval buttons (1m, 5m, 15m, 1h, 1D), volume, buy/sell markers at fill price and time, and an Option chain tab; TradingView attribution logo visible. Right: live decision feed, each card showing time, model, reasoning summary, proposed orders and guardrail result (approved or rejected with reason); clicking a chart marker opens its card. Bottom tabs: Positions, Open orders, Fills, Account (cash, equity, buying power).

Sample content: the candles and markers are illustrative, not real prices. Each watchlist row names its data source, as decided for market data.

## Forward-test venues

Of the platforms Daksh asked about, only Alpaca and IBKR offer paper trading an outside platform can drive through an API; TradingView is a signal and chart tool, not a broker.

| Platform | What it is | Paper trading via API | What it takes for us | Fit for the MVP |
| --- | --- | --- | --- | --- |
| [Alpaca](https://docs.alpaca.markets/docs/about-connect-api) | Broker, equities + options | Yes, paper by default | Nothing to start; approval only for live trading of other users | Launch venue |
| [Interactive Brokers](https://www.interactivebrokers.com/docs/web-api/authentication/paper) | Broker, all four instruments | Yes, "minimal differences" from live | A funded live account behind each paper account, plus third-party compliance approval estimated at 8 to 14 weeks in total ([IBKR](https://www.interactivebrokers.com/docs/web-api/trading/getting-started/trading-access-for-third-parties)) | Second venue; start the approval early |
| [TradingView](https://blog.traderspost.io/article/how-to-use-tradingview-webhooks) | Charts and alerts; sends webhooks when an alert fires | No; it places no orders itself | A webhook endpoint on our side | Signal input: an investor's existing TradingView alert can become an agent's trigger or data source |
| [Robinhood](https://www.finder.com/stock-trading/robinhood-agentic-accounts) | Broker; agent MCP in a separate account | No paper mode found; every order is live | A customer connecting their own agent | Later, for approve-each-trade on investors' own accounts |
| [Tradovate](https://partner.tradovate.com/resources/reference/environments) | Futures broker | Yes, demo endpoints | A funded live account and the API add-on, per its forum | Futures phase, not launch |
| [thinkorswim / Schwab](https://www.schwab.com/trading/thinkorswim/paper-trading) | Broker; paperMoney simulator inside thinkorswim | No API route found to paperMoney (secondary source) | Schwab Trader API reaches live accounts only | Later, live phase |

**Inferred:** building the broker layer as one adapter interface lets the MVP launch on Alpaca while IBKR approval runs, and each later broker is a new adapter, not a rewrite. Unverified until checked on each broker's own docs: Robinhood's lack of paper mode and thinkorswim's lack of a paperMoney API.

## Limits and costs found after the decisions

Three findings change how decision 5 and decision 3 get built: Alpaca caps paper accounts per user, real-time data shown to investors needs a commercial plan, and the AI bill is set by how often agents decide.

**Alpaca paper accounts.** An Alpaca staff reply says each user gets 3 paper accounts and 1 live account ([forum](https://forum.alpaca.markets/t/feature-request-more-paper-trading-accounts/18125)), so the Trading API cannot give every agent version its own account. Alpaca's Broker API sandbox can create many simulated accounts on the same engine as paper trading, funded through its Transfer API ([docs](https://docs.alpaca.markets/docs/integration-setup-with-alpaca)). Not yet confirmed: whether Alpaca allows the sandbox to serve a public product.

**Market data.** Alpaca's free plan gives real-time IEX only for stocks and an indicative feed for options; Algo Trader Plus is $99/month for all US exchanges and OPRA options ([docs](https://docs.alpaca.markets/docs/about-market-data-api)). Platforms serving many users use Broker API plans, $500 to $2,000/month for the StandardPlus tiers ([Alpaca](https://alpaca.markets/broker-resources/learn-article/add-market-data-to-your-trading-app-with-alpaca-market-data-api)). **Inferred:** agents can decide on data we don't display, but showing live quotes to investors needs a redistribution-licensed plan; terms need Alpaca's sales team.

**AI cost per decision.** Prices are Anthropic's list rates (cached 2026-10-06). The token counts are my assumption for one decision: 8,000 input tokens (instructions, positions, market snapshot) and 1,000 output tokens, before caching discounts.

| Model | $ per 1M input / output tokens | Cost per decision | One agent, once a day, 21 trading days | One agent, every 5 minutes (78 a day), 21 trading days |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 | $4 / $20 | $0.052 | $1.09 | $85 |
| Claude Sonnet 5.5 | $2 / $10 | $0.026 | $0.55 | $43 |
| Claude Haiku 5.5 | $0.10 / $0.50 | $0.0013 | $0.03 | $2.13 |

**Inferred:** with the MVP free (decision 9), how often agents may decide is the biggest cost lever, larger than the choice of model.

**Minimum forward test before listing.** I found no industry standard; this is a product choice with a statistical trade-off. Longer tests make records more trustworthy and slow how fast the library fills.

## Decision log (source of truth)

All decided by Daksh on 2026-10-20. Where anything above disagrees, this list wins.

| # | Decision | Chosen | Notes |
| --- | --- | --- | --- |
| 1 | How investors use an agent | Paper-follow only | No live trading of investors' accounts in the MVP; investors need no brokerage account. Approve-each-trade is the candidate next phase |
| 2 | Instruments at launch | Equities + options | Futures next, forex last |
| 3 | How an agent decides at runtime | An LLM decides each trade live | Runs can't be replayed exactly, so the trust record logs every decision's inputs, prompt, model version and output; AI cost per decision is a design input |
| 4 | What a "trained" agent stores | Prompt + tools | A version = instructions, data sources, tools, risk limits, tuned through forward-test results; no memory store or fine-tuned weights in the MVP |
| 5 | Brokers and forward-test venue | One broker adapter interface; forward tests on Alpaca at launch | IBKR third-party approval applied for separately; TradingView joins as a webhook signal input, not a broker; Robinhood, Schwab and Tradovate come with live and futures phases |
| 6 | Who the MVP serves first | Developers and investors, both on paper | Developers build and forward-test; investors paper-follow from day one |
| 7 | Market | US only | Other countries later |
| 8 | What investors see of an agent | Summary + record | Plain-language summary, tools, risk limits and full forward-test record are public; prompts stay private to the developer |
| 9 | How the platform earns | Free during MVP | No billing code |
| 10 | Paper accounts per agent | Alpaca Broker API sandbox, one simulated account per agent version, funded via the Transfer API | Pending Alpaca's OK for a public product; fallback is our own simulator filling paper orders from Alpaca market data. Keep this behind the broker adapter so the switch is one implementation |
| 11 | How often agents decide, and which model | Developer sets cadence and picks Claude Haiku 5.5, Sonnet 5.5 or Opus 5.5 per agent | Cap counts dollars: $10 of AI spend per developer per month, then that developer's agents pause until the next month |
| 12 | Minimum forward test before listing | 30 trading days and at least 20 trades | Records under 90 trading days carry a "Young record" label |
| 13 | Tech stack | TypeScript full stack | Next.js web app, Node workers, Postgres, Anthropic TypeScript SDK |
| 14 | Backtesting | Smoke test only | Short run on recent data, developer-only, never in the trust record (LLM hindsight bias) |
| 15 | What a strategy is | A reusable building block | Entry rules, exit rules, signals, TradingView alerts, tool setups; agents combine strategies with a model and risk limits; Library has Agents and Strategies tabs |
| 16 | Market data shown to users | Free real-time IEX plus 15-minute-delayed all-exchange (SIP) | Every quote labeled with its source; paid real-time SIP and OPRA wait for live trading |
| 17 | How people sign in | Google and GitHub | Built with Better Auth (open source; Auth.js's own README now recommends it for new projects). Accounts live in our Postgres; Daksh creates one Google and one GitHub OAuth app. A demo sign-in exists for local development and tests only |
| 18 | What counts toward the $10 AI cap | Everything | Forward-test decisions, Studio chat builder messages and smoke tests all count, so each developer's AI bill stays capped at $10 a month |
| 19 | Following an agent that already holds positions | Copy current positions | The follower starts with a scaled copy of the agent's holdings, so their return tracks the agent's record exactly from the day they follow |
| 20 | What runs the decision timer on the hosted site | GitHub Actions | A scheduled workflow calls the site's scheduler endpoint every 5 minutes for free; Vercel's free plan only runs cron jobs daily |
| 21 | How visitors get in on the public MVP (replaces Google/GitHub sign-in for now, row 17) | Guest accounts | "Continue as guest" makes an account with one click, no sign-up. Google and GitHub buttons appear only if their keys are set. Because anyone can become a developer, all AI spend across the site also stops at $50 a month (Default) |

## Still open outside the code (Daksh's actions, none blocks the build)

- Alpaca must confirm a public product may run forward tests on the Broker API sandbox (decision 10). Until then, build against the sandbox behind the adapter.
- IBKR third-party application (needs a business entity and public website).
- Securities counsel before anything goes live or charges money.

