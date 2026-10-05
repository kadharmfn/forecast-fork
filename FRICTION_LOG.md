# Friction log — building forecast-fork on AWS

Real friction encountered while building forecast-fork for the Alexa+ track, captured as we
hit it rather than reconstructed afterward. Shared as direct feedback to the Amazon teams
building these tools, not as a complaint about the project — forecast-fork works, and these are
the specific points where the path to "working" was harder or less obvious than it needed to be.

---

## 1. Bedrock model invocation — invalid identifier, then inference-profile requirement

- **Task attempted:** Call a Claude model on Amazon Bedrock via `InvokeModelCommand`
  (`@aws-sdk/client-bedrock-runtime`).
- **Steps taken:** Set `BEDROCK_MODEL_ID` to a plain model ID copied from Bedrock's model
  catalog page in the console.
- **Expected result:** Successful invocation.
- **Actual result:** First attempt failed outright with an invalid-identifier-style error.
  After correcting that, a second, different failure appeared: some newer Claude models
  cannot be invoked by base model ID at all — they require the full inference-profile ARN
  (e.g. `arn:aws:bedrock:us-east-2:<account>:inference-profile/...`) instead.
- **Severity:** Moderate — blocked the very first run, and neither error message pointed
  toward the actual fix.
- **Workaround used:** Found the inference-profile ARN requirement through trial and error
  and community/docs searching, then used the full ARN as `BEDROCK_MODEL_ID`, matching
  `AWS_REGION` to the region embedded in the ARN.
- **Actionable suggestion:** When a model requires an inference profile, have the
  `InvokeModel` error say so explicitly (e.g. "this model requires an inference profile ARN,
  not a base model ID") instead of a generic access/invocation failure. The Bedrock console's
  model catalog page could also flag inference-profile-only models directly next to the model
  ID that's offered for copying.

## 2. Bedrock API key vs. full IAM credentials — not interchangeable

- **Task attempted:** Run a companion project's (`alexa-skill-mcp-bridge`) health check
  (`npm run doctor`) against our running MCP server.
- **Steps taken:** Supplied our existing `AWS_BEARER_TOKEN_BEDROCK` (a Bedrock-console-issued
  API key) as the bridge's AWS credential, since it already worked fine for our own server's
  Bedrock calls.
- **Expected result:** Health check passes.
- **Actual result:** Failed. The bridge's doctor check calls AWS STS (`GetCallerIdentity`)
  directly to verify credentials, and STS doesn't understand a Bedrock-scoped bearer token —
  it needs real IAM SigV4 credentials.
- **Severity:** Moderate — required provisioning new AWS infrastructure (a new IAM user),
  not just a config change.
- **Workaround used:** Created a separate IAM user for programmatic access only, attached an
  inline policy scoped to `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`,
  and used that access key pair specifically for STS-dependent tooling.
- **Actionable suggestion:** Document explicitly, wherever Bedrock API keys are introduced,
  that they satisfy Bedrock Runtime calls only and will not pass a generic AWS SDK credential
  check (STS, IAM policy simulation, etc.). The two credential types look interchangeable from
  the outside but aren't, and that distinction cost real debugging time.

## 3. Reasoning latency vs. Alexa+'s round-trip expectation

- **Task attempted:** Validate the full pipeline (geocode → weather → Bedrock reasoning →
  Places) against a simulated Alexa response deadline (~6.5s, via the bridge).
- **Steps taken:** Ran real queries end-to-end through the deployed pipeline and measured
  wall-clock time per stage (see `scripts/load-test.ts`).
- **Expected result:** A response within the deadline, or at least close to it.
- **Actual result:** Bedrock reasoning alone averages 6.2s (measured across 30 regions, 100%
  success rate) — already close to or over the simulated deadline before geocode/weather/places
  latency is even added. This regularly triggered the bridge's natural "I'm still working on
  that" filler response.
- **Severity:** Critical for production readiness (not for the hackathon demo, which works
  fine with this latency — but it is a hard blocker for a real Alexa+ deployment given the
  documented <500ms round-trip expectation).
- **Workaround used:** None — documented as a known, honest limitation in the project rather
  than hidden or glossed over.
- **Actionable suggestion:** A Bedrock inference mode or smaller model tier specifically tuned
  for sub-second voice-assistant latency budgets (even at reduced reasoning depth/output
  length) would materially change what's buildable for Alexa+ today. Streaming partial
  structured tool-use output (so a voice client could start speaking the first dish while the
  rest of the reasoning still generates) would also help close this gap without needing a
  faster model.

## 4. Alexa+ developer access — invite-only, no public queue

- **Task attempted:** Get real Alexa+ access to validate the MCP server against the actual
  assistant, not just a simulation.
- **Steps taken:** Checked developer.amazon.com for an Alexa+ for Builders signup or waitlist.
- **Expected result:** A public signup flow or waitlist, as is typical for most developer
  preview programs.
- **Actual result:** Alexa+ for Builders is described as "currently available to select
  partners working directly with our team" — there is no public waitlist or self-serve signup
  path at all.
- **Severity:** Critical for true end-to-end validation; this reshaped the whole validation
  strategy for the project, not just one task.
- **Workaround used:** Validated via three independent paths instead: MCP Inspector
  (protocol-level), a simulated Alexa+-style web UI, and a real agentic orchestrator
  (`alexa-skill-mcp-bridge`, a Strands agent on Bedrock AgentCore with Amazon Nova) that
  discovers and calls our tools unscripted — the closest approximation to real Alexa+
  orchestration available without partner-level access.
- **Actionable suggestion:** A hackathon-scoped sandbox tier for Alexa+ access — even
  time-boxed or rate-limited — would let teams validate against the real assistant instead of
  only approximating it, and would likely surface integration issues (auth, latency,
  response formatting) that a simulated client can't.
